/**
 * 以下示例使用了一个自定义 sleep(ms) 函数来替代 page.waitForTimeout(ms)，
 * 以确保在一些旧版本 Puppeteer 或特定环境里也能正常延时。
 * 与此同时，保留了"先展开后选择"的逻辑。
 */

const fs = require('fs');
const puppeteer = require('puppeteer');

// 添加全局结果数组
const results = [];

/** 自定义延时函数 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 1) 配置需要搜索的参数
const YEARS = [2022, 2023];                     // 可根据需要改
const FUND_TYPES = [
  "面上项目", 
  "重点项目",
  "重大研究计划",
  "联合基金项目",
  "青年科学基金项目",
  "地区科学基金项目",
  "专项基金项目"
];

const CODES = [
  // C 生命科学部 (C01-C21)
  ...Array.from({length: 21}, (_, i) => `C${String(i + 1).padStart(2, '0')}`),
  // H 医学科学部 (H01-H35)
  ...Array.from({length: 35}, (_, i) => `H${String(i + 1).padStart(2, '0')}`)
];

// 2) 通用搜索函数
async function runSearch(page, { year, fundType, code }) {
  const results = [];

  console.log(`--> runSearch 开始: year=${year}, fundType=${fundType}, code=${code}`);

  // (A) 打开页面
  await page.goto('https://kd.nsfc.cn/finalProjectInit?advanced=true', { waitUntil: 'networkidle2' });
  // 等待主要表单载入
  await page.waitForSelector('.el-collapse-item.is-active', { timeout: 10000 });

  // (B) 选择结题年度
  try {
    const yearInputSelector = '.el-form-item__content .el-date-editor--year .el-input__inner';
    await page.waitForSelector(yearInputSelector, { visible: true });
    await page.click(yearInputSelector);

    const yearPanelSelector = '.el-year-table';
    await page.waitForSelector(yearPanelSelector, { visible: true, timeout: 15000 });

    const allYears = await page.$$(yearPanelSelector + ' td');
    let foundYear = false;
    for (const yTd of allYears) {
      const text = await yTd.$eval('.cell', el => el.textContent.trim());
      if (text === String(year)) {
        await yTd.click(); // 点击选中该年
        foundYear = true;
        break;
      }
    }
    if (!foundYear) {
      console.warn(`(警告) 未找到年份 ${year}，请检查下拉���否存在。`);
    }
  } catch (err) {
    console.error(`选择年度 ${year} 时出错:`, err);
  }

  // (C) 选择资助类别（若��多级展开结构，就要像申请代码那样找switcher；这里演示单层�������������������������������������������������������������������������
  try {
    const fundInputSelector = 'label[for="projectType"] + .el-form-item__content .el-input';
    await page.waitForSelector(fundInputSelector, { visible: true, timeout: 10000 });
    await page.click(fundInputSelector);

    // 等待下拉出现
    const dropdownSelector = '.el-select-dropdown';
    await page.waitForSelector(dropdownSelector, { visible: true, timeout: 10000 });

    let foundFund = false;
    const liItems = await page.$$(dropdownSelector + ' li');
    for (const li of liItems) {
      const liText = await li.evaluate(el => el.innerText.trim());
      if (liText === fundType) {
        await li.click();
        foundFund = true;
        break;
      }
    }
    if (!foundFund) {
      console.warn(`(警告) 资助类别下拉里没有 "${fundType}"`);
    }
  } catch (err) {
    console.error(`选择资助类别 "${fundType}" 时出错:`, err);
  }

  // (D) 申请代码处理
  try {
    console.log('点击"申请代码"输入框...');
    await page.click('label[for="code"] ~ .el-form-item__content .el-input input[readonly]');
    await sleep(1000);

    console.log('等待��结��出��...');
    await page.waitForSelector('.ant-tree', { visible: true, timeout: 10000 });
    await sleep(500);

    // 1. ���开���部
    const deptTitle = code.startsWith('C') ? 'C 生命科学部' : 'H 医学科学部';
    console.log(`准备展开学部: ${deptTitle}`);
    const deptNodes = await page.$$('.ant-tree-title');
    for (const node of deptNodes) {
      const titleText = await node.evaluate(el => el.textContent.trim());
      if (titleText === deptTitle) {
        const switcher = await node.evaluateHandle(el => el.parentElement.previousElementSibling);
        if (switcher) {
          await switcher.click();
          console.log('已点击学部展开按钮');
          await sleep(1000);
        } else {
          console.log('未找到学部 switcher，可能已展开');
        }
        break;
      }
    }

    // 2. 展开主类（如 C01）
    const mainCat = code.length > 3 ? code.substring(0, 3) : code;
    console.log(`查找并点击大类 "${mainCat}"...`);
    let mainFound = false;
    const mainNodes = await page.$$('.ant-tree-title');
    for (const node of mainNodes) {
      const titleText = await node.evaluate(el => el.textContent.trim());
      if (titleText.startsWith(mainCat)) {
        console.log(`找到大类节点：${titleText}，点击其展开��钮...`);
        const switcher = await node.evaluateHandle(el => el.parentElement.previousElementSibling);
        if (switcher) {
          await switcher.click();
          console.log(`已点击展开 ${mainCat} 的 switcher`);
          await sleep(500);
        } else {
          console.log('未找到此大类的 switcher，可能已展开');
        }
        mainFound = true;
        break;
      }
    }
    if (!mainFound) {
      console.warn(`未找到大类 "${mainCat}"，请确认在 "${deptTitle}" 下是否存在`);
    }

    // 3. 获取所有子类
    console.log('准备获取子类列表...');
    await sleep(1000); // 确保树完全展开

    const debugInfo = await page.evaluate((mainCat) => {
      // 1. 先找到特定的主类节点（如 C01）
      const mainTitle = Array.from(document.querySelectorAll('.ant-tree-title'))
        .find(el => el.textContent.trim().startsWith(mainCat));
      
      if (!mainTitle) {
        return {
          error: `未找到主类 ${mainCat}`,
          allTitles: Array.from(document.querySelectorAll('.ant-tree-title'))
            .map(el => el.textContent.trim())
            .slice(0, 10) // 只显示前10个作为示例
        };
      }

      const mainLi = mainTitle.closest('li');
      if (!mainLi) {
        return { error: '未找到主类�� li 元���' };
      }

      return {
        mainClass: mainTitle.textContent.trim(),
        hasChildTree: !!mainLi.querySelector('.ant-tree-child-tree'),
        isChildTreeOpen: !!mainLi.querySelector('.ant-tree-child-tree-open'),
        childItems: mainLi.querySelectorAll(':scope > ul.ant-tree-child-tree > li').length,
        childTitles: Array.from(mainLi.querySelectorAll(':scope > ul.ant-tree-child-tree > li .ant-tree-title'))
          .map(el => el.textContent.trim())
      };
    }, mainCat);

    console.log('调试信息：', debugInfo);

    const subCodes = await page.evaluate((mainCat) => {
      // 1. 找到特定的主类节点
      const mainTitle = Array.from(document.querySelectorAll('.ant-tree-title'))
        .find(el => el.textContent.trim().startsWith(mainCat));
      
      if (!mainTitle) {
        console.log(`未找到主类 ${mainCat}`);
        return [];
      }
      
      // 2. 获取主类的 li 元素
      const mainLi = mainTitle.closest('li');
      if (!mainLi) {
        console.log('未找到主类的 li 元素');
        return [];
      }
      
      // 3. 只获取这个主类下的直接子节点
      const subItems = mainLi.querySelectorAll(':scope > ul.ant-tree-child-tree > li');
      console.log(`在 ${mainCat} 下找到 ${subItems.length} 个直接子类节点`);
      
      // 4. 提取子类代码
      return Array.from(subItems)
        .map(item => {
          const title = item.querySelector('.ant-tree-title');
          if (!title) return null;
          const text = title.textContent.trim();
          console.log(`子类文本: ${text}`);
          return text.split(' ')[0];
        })
        .filter(Boolean);
    }, mainCat);

    console.log(`获取到的子类代码：`, subCodes);
    if (subCodes.length === 0) {
      console.error(`未找到 ${mainCat} 的任何子类！`);
      // 添加调试信息
      const debugInfo = await page.evaluate(() => {
        const mainLi = document.querySelector('li:has(.ant-tree-title)');
        return {
          hasMainLi: !!mainLi,
          hasChildTree: mainLi ? !!mainLi.querySelector('.ant-tree-child-tree') : false,
          isChildTreeOpen: mainLi ? !!mainLi.querySelector('.ant-tree-child-tree-open') : false,
          childItems: mainLi ? mainLi.querySelectorAll('li').length : 0
        };
      });
      console.log('调试信息：', debugInfo);
      return results;
    }

    // 4. 对每个子类进行单独处理
    if (code.length === 3) {
      for (const subCode of subCodes) {
        console.log(`\n开始处理子类 ${subCode}...`);
        
        try {
          // 直接在当前展开的树中选择子类
          const selected = await page.evaluate((targetCode) => {
            const allTitles = [...document.querySelectorAll('.ant-tree-title')];
            for (const title of allTitles) {
              const text = title.textContent.trim();
              if (text.startsWith(targetCode)) {
                const wrapper = title.closest('.ant-tree-node-content-wrapper');
                if (wrapper) {
                  wrapper.click();
                  return true;
                }
              }
            }
            return false;
          }, subCode);

          if (!selected) {
            throw new Error(`未能选中子类 ${subCode}`);
          }

          console.log(`已选中子类 ${subCode}，准备检索...`);
          
          // 关闭申请代码选择框
          await page.keyboard.press('Escape');
          await sleep(500);

          // 点击检索按钮
          console.log('点击检索按钮...');
          const searchBtn = await page.$$('button.SolidBtn');
          let foundBtn = false;
          for (const btn of searchBtn) {
            const btnText = await btn.evaluate(el => el.innerText.trim());
            if (btnText.includes('检索')) {
              await btn.click();
              foundBtn = true;
              console.log('����点击检索按钮');
              break;
            }
          }

          if (!foundBtn) {
            console.error('未找到检索按钮，跳过此子类');
            continue;
          }

          // 等待检索结果
          try {
            await page.waitForSelector('.info-warp', { visible: true, timeout: 20000 });
            console.log('检索结果已加载');

            // 清空当前子类的结果数组
            const subResults = [];

            // 抓取当前子类的所有页面结果
            while (true) {
              const pageResults = await scrapeCurrentPage(page, { year, fundType, code: subCode });
              subResults.push(...pageResults);
              
              const nextBtn = await page.$('button.btn-next');
              if (!nextBtn) {
                console.log('没有下一页按钮，完成当前子类');
                break;
              }
              
              const disabled = await nextBtn.evaluate(el => el.disabled);
              if (disabled) {
                console.log('下一页按钮已禁用，完成当前子类');
                break;
              }
              
              console.log('点击下一页...');
              await nextBtn.click();
              await sleep(1500);
            }

            console.log(`完成子类 ${subCode} 的数据抓取，共 ${subResults.length} 条数据`);
            
            // 保存当前子类的结果
            await saveResultsToCSV(subResults, code, subCode);
            await sleep(1000);

          } catch (err) {
            console.error(`处理子类 ${subCode} 的检索结果时出错:`, err);
          }
        } catch (err) {
          console.error(`处理子类 ${subCode} 时出错:`, err);
        }
      }
    } else {
      // 如果是 C0101 这样的具体代��，只理这一个
      const selected = await page.evaluate((code) => {
        const allTitles = [...document.querySelectorAll('.ant-tree-title')];
        const targetNode = allTitles.find(el => el.textContent.trim().startsWith(code));
        if (targetNode) {
          targetNode.click();
          return true;
        }
        return false;
      }, code);

      if (selected) {
        // 执行检索和数据抓取
        // ... ���索按钮点击和数据抓取的代码 ...
      }
    }

  } catch (err) {
    console.error(`处理申请代码 "${code}" 时出错:`, err);
  }

  return results;
}

// 添加抓取当前页面数据的函数
async function scrapeCurrentPage(page, { year, fundType, code }) {
  const pageResults = await page.evaluate(({ year, fundType, code }) => {
    const items = document.querySelectorAll('.info-warp');
    return Array.from(items).map(item => {
      // 获取标题 (第一个 a 标签的文本)
      const titleEl = item.querySelector('p.textEllipsis a');
      const title = titleEl ? titleEl.textContent.trim().replace(/^\d+\./, '').trim() : '';
      
      // 获取第二行的信息
      const secondRow = item.querySelectorAll('.el-row')[1];
      const approveText = secondRow?.querySelector('.el-col:nth-child(1)')?.textContent.replace('批准号：', '').trim() || '';
      const codeText = secondRow?.querySelector('.el-col:nth-child(2)')?.textContent.replace('申请代码：', '').trim() || '';
      const fundTypeText = secondRow?.querySelector('.el-col:nth-child(3)')?.textContent.replace('项目类别：', '').trim() || '';
      const personText = secondRow?.querySelector('.el-col:nth-child(4) a')?.textContent.trim() || '';

      // 获取第三行的信息
      const thirdRow = item.querySelectorAll('.el-row')[2];
      const money = thirdRow?.querySelector('.el-col:nth-child(1)')?.textContent.replace('资助经费：', '').replace('（万元）', '').trim() || '';
      const approveYear = thirdRow?.querySelector('.el-col:nth-child(2)')?.textContent.replace('批准年度：', '').trim() || '';
      const endYear = thirdRow?.querySelector('.el-col:nth-child(3)')?.textContent.replace('结题年度：', '').trim() || '';
      const organization = thirdRow?.querySelector('.el-col:nth-child(4) a')?.textContent.trim() || '';

      // 获取关键词
      const keywordsRow = item.querySelectorAll('.el-row')[3];
      const keywords = Array.from(keywordsRow?.querySelectorAll('span') || [])
        .map(span => span.textContent.trim().replace('；', ''))
        .filter(Boolean)
        .join('；');

      return {
        title,
        approveText,
        codeText,
        fundTypeText,
        personText,
        money,
        approveYear,
        endYear,
        organization,
        keywords,
        // 使用传入的参数
        searchYear: year,
        searchFund: fundType,
        searchCode: code
      };
    });
  }, { year, fundType, code });

  console.log(`当前页抓取到 ${pageResults.length} 条数据`);
  return pageResults;
}

// 添加保存结果到 CSV 的函数
async function saveResultsToCSV(results, mainCode, subCode) {
  // 创建主目录（如果不存在）
  const mainDir = `./results/${mainCode}`;
  if (!fs.existsSync('./results')) {
    fs.mkdirSync('./results');
  }
  if (!fs.existsSync(mainDir)) {
    fs.mkdirSync(mainDir);
  }

  // 创建子类目录
  const subDir = `${mainDir}/${subCode}`;
  if (!fs.existsSync(subDir)) {
    fs.mkdirSync(subDir);
  }

  // 生成 CSV 内容
  let csv = 'searchYear,searchFund,searchCode,title,approveText,codeText,fundTypeText,personText,money,approveYear,endYear,organization,keywords\n';

  for (const row of results) {
    const lineArr = [
      row.searchYear,
      row.searchFund,
      row.searchCode,
      row.title,
      row.approveText,
      row.codeText,
      row.fundTypeText,
      row.personText,
      row.money,
      row.approveYear,
      row.endYear,
      row.organization,
      row.keywords
    ].map(x => {
      const text = (x == null ? '' : String(x));
      return `"${text.replace(/"/g, '""')}"`;
    });

    csv += lineArr.join(',') + '\n';
  }

  // 保存文件
  const filename = `${subDir}/results.csv`;
  fs.writeFileSync(filename, csv, 'utf-8');
  console.log(`已保存结果到 ${filename}`);
}

// 3) 主数：对 YEARS、FUND_TYPES、CODES 做多重循环
;(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  const allResults = [];

  for (const y of YEARS) {
    for (const ft of FUND_TYPES) {
      for (const c of CODES) {
        console.log(`开始搜索: year=${y}, fundType=${ft}, code=${c}`);
        // 调用 runSearch
        const partialRes = await runSearch(page, {
          year: y,
          fundType: ft,
          code: c
        });
        console.log(`获取 ${partialRes.length} 条结果`);
        allResults.push(...partialRes);
      }
    }
  }

  console.log(`所有搜索结束，共计 ${allResults.length} 条结果。准备写 CSV...`);

  // 写出 CSV
  console.log(`开始写 CSV，共 ${allResults.length} 条数据`);
  let csv = 'searchYear,searchFund,searchCode,title,approveText,codeText,fundTypeText,personText,money,approveYear,endYear,organization,keywords\n';

  for (const row of allResults) {
    const lineArr = [
      row.searchYear,
      row.searchFund,
      row.searchCode,
      row.title,
      row.approveText,
      row.codeText,
      row.fundTypeText,
      row.personText,
      row.money,
      row.approveYear,
      row.endYear,
      row.organization,
      row.keywords
    ].map(x => {
      const text = (x == null ? '' : String(x));
      return `"${text.replace(/"/g, '""')}"`;
    });

    csv += lineArr.join(',') + '\n';
  }

  fs.writeFileSync('all_search_results.csv', csv, 'utf-8');
  console.log('已写出CSV：all_search_results.csv');

  // 如果不需要看页面，可自行关闭
  // await browser.close();
})();