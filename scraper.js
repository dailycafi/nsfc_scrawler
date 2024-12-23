/**
 * 以下示例使用了一个自定义 sleep(ms) 函数来替代 page.waitForTimeout(ms)，
 * 以确保在一些旧版本 Puppeteer 或特定环境里也能正常延时。
 * 与此同时，保留了"先展开后选择"的逻辑。
 */

const fs = require('fs');
const puppeteer = require('puppeteer');

/** 自定义延时函数 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 1) 配置需要搜索的参数
const YEARS = [2022, 2023];                     // 可根据需要改
const FUND_TYPES = ["面上项目", "青年科学基金项目"]; // 若是多层结构请自行修改
const CODES = ["C05", "C06"];                   // 都在 "C 生命科学部" 下
const KEYWORD = "RNA";                          // 关键词

// 2) 通用搜索函数
async function runSearch(page, { year, fundType, code, keyword }) {
  const results = [];

  console.log(`--> runSearch 开始: year=${year}, fundType=${fundType}, code=${code}, kw=${keyword}`);

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
      console.warn(`(警告) 未找到年份 ${year}，请检查下拉是否存在。`);
    }
  } catch (err) {
    console.error(`选择年度 ${year} 时出错:`, err);
  }

  // (C) 选择资助类别（若是多级展开结构，就要像申请代码那样找switcher；这里演示单层）
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

  // (D) 申请代码：先点击输入，再展开"C 生命科学部"，再找 code，如 "C05"
  try {
    // 1. 点击"申请代码"输入框
    await page.click('label[for="code"] ~ .el-form-item__content .el-input input[readonly]');
    await sleep(800);  // 等待树状DOM渲染

    // 2. 等待树结构出现
    await page.waitForSelector('.ant-tree', { visible: true, timeout: 10000 });

    // 3. 找到并展开 "C 生命科学部"
    console.log('开始查找 "C 生命科学部" switcher...');
    let cScienceSwitcher = null;
    const switchers = await page.$$('.ant-tree-switcher');
    for (const sw of switchers) {
      const titleNode = await sw.evaluateHandle(
        el => el.parentElement.querySelector('.ant-tree-title')
      );
      if (!titleNode) continue;

      const titleText = await titleNode.evaluate(el => el.textContent.trim());
      // 若实际有 "C 生命科学部(3300项)" 等字样，可用 includes('C 生命科学部')
      if (titleText === 'C 生命科学部') {
        cScienceSwitcher = sw;
        break;
      }
    }
    if (cScienceSwitcher) {
      const swClass = await (await cScienceSwitcher.getProperty('className')).jsonValue();
      if (swClass.includes('ant-tree-switcher_close')) {
        console.log('检测到 "C 生命科学部" 处于 close 状态 -> 点击展开');
        await cScienceSwitcher.click();
        await sleep(800);
      } else {
        console.log('"C 生命科学部" 似乎已展开');
      }
    } else {
      console.warn('(警告) 未找到 "C 生命科学部" 节点；请确认文本匹配');
    }

    // 4. 找到 code 对应的节点(如 "C05 ...""C06 ...") 并展开/点击
    console.log(`开始查找与 "${code}" 对应的节点...`);
    let codeSwitcher = null;
    const switchers2 = await page.$$('.ant-tree-switcher');
    for (const sw of switchers2) {
      const titleNode = await sw.evaluateHandle(
        el => el.parentElement.querySelector('.ant-tree-title')
      );
      if (!titleNode) continue;

      const titleText = await titleNode.evaluate(el => el.textContent.trim());
      // 如果网页上是 "C05 遗传学..."，就用 startsWith(code)；如果是别的格式就要改
      if (titleText.startsWith(code)) {
        codeSwitcher = sw;
        break;
      }
    }

    if (codeSwitcher) {
      const codeClass = await (await codeSwitcher.getProperty('className')).jsonValue();
      if (codeClass.includes('ant-tree-switcher_close')) {
        console.log(`${code} 也处于 close 状态 -> 点击展开`);
        await codeSwitcher.click();
        await sleep(800);
      }

      // 5. 最后点击节点 wrapper
      const codeWrapper = await codeSwitcher.evaluateHandle(
        el => el.parentElement.querySelector('.ant-tree-node-content-wrapper')
      );
      if (codeWrapper) {
        await codeWrapper.click();
        console.log(`${code} 节点已点击选中`);
      } else {
        console.warn(`(警告) 找到 "${code}" switcher，但未匹配到 content-wrapper`);
      }
    } else {
      console.warn(`(警告) 未在树中找到与 "${code}" 匹配的节点`);
    }
  } catch (err) {
    console.error(`选择申请代码 "${code}" 时出错:`, err);
  }

  // (E) 输入关键词
  try {
    const formItems = await page.$$('.el-form-item');
    let kwInput = null;
    for (const fi of formItems) {
      const labelEl = await fi.$('.el-form-item__label');
      if (!labelEl) continue;
      const labelText = await labelEl.evaluate(el => el.textContent.trim());
      if (labelText.includes('项目关键词')) {
        kwInput = await fi.$('input.el-input__inner');
        break;
      }
    }
    if (kwInput) {
      await kwInput.click({ clickCount: 3 });
      await kwInput.press('Backspace');
      await kwInput.type(keyword);
      console.log(`已输入关键词 "${keyword}"`);
    } else {
      console.warn('(警告) 未找到"项目关键词"输入框');
    }
  } catch (err) {
    console.error(`输入关键词 "${keyword}" 时出错:`, err);
  }

  // (F) 点击"检索"，等待并翻页抓取
  try {
    // 找到"检索"按钮并点击
    let foundBtn = false;
    const btns = await page.$$('button.SolidBtn');
    for (const b of btns) {
      const btnTxt = await b.evaluate(el => el.innerText.trim());
      if (btnTxt.includes('检索')) {
        await b.click();
        foundBtn = true;
        console.log('已点击"检索"按钮');
        break;
      }
    }
    if (!foundBtn) {
      console.warn('(警告) 未找到"检索"按钮');
    } else {
      await sleep(1500);  // 等页面加载
    }

    // 等结果容器出现
    await page.waitForSelector('.info-warp', { visible: true, timeout: 20000 });

    // 小函数：抓取当前页结果
    async function scrapeCurrentPage() {
      const items = await page.$$('.info-warp');
      for (const item of items) {
        // 1. 获取标题
        let title = '';
        const titleEl = await item.$('p.textEllipsis a');
        if (titleEl) {
          title = await titleEl.evaluate(el => el.textContent.trim());
        }

        // 如果连标题都没有，就跳过这条记录
        if (!title) continue;

        // 2. 获取第二行信息（批准号、申请代码、项目类别、负责人）
        const secondRow = await item.$('.el-row:nth-child(2)');
        let approveText = '', codeText = '', fundTypeText = '', personText = '';
        
        if (secondRow) {
          const cols = await secondRow.$$('.el-col');
          for (const col of cols) {
            const text = await col.evaluate(el => el.textContent.trim());
            if (text.includes('批准号')) {
              approveText = text.replace('批准号：', '').trim();
            } else if (text.includes('申请代码')) {
              codeText = text.replace('申请代码：', '').trim();
            } else if (text.includes('项目类��')) {
              fundTypeText = text.replace('项目类别：', '').trim();
            } else if (text.includes('项目负责人')) {
              personText = text.replace('项目负责人：', '').trim();
            }
          }
        }

        // 3. 获取第三行信息（资助经费、批准年度、结题年度、依托单位）
        const thirdRow = await item.$('.el-row:nth-child(3)');
        let money = '', approveYear = '', endYear = '', organization = '';
        
        if (thirdRow) {
          const cols = await thirdRow.$$('.el-col');
          for (const col of cols) {
            const text = await col.evaluate(el => el.textContent.trim());
            if (text.includes('资助经费')) {
              money = text.replace('资助经费：', '').trim();
            } else if (text.includes('批准年度')) {
              approveYear = text.replace('批准年度：', '').trim();
            } else if (text.includes('结题年度')) {
              endYear = text.replace('结题年度：', '').trim();
            } else if (text.includes('依托单位')) {
              organization = text.replace('依托单位：', '').trim();
            }
          }
        }

        // 4. 获取关键词
        const fourthRow = await item.$('.el-row:nth-child(4)');
        let keywords = '';
        if (fourthRow) {
          keywords = await fourthRow.evaluate(el => {
            const spans = el.querySelectorAll('span');
            return Array.from(spans).map(span => span.textContent.trim()).join('；');
          });
        }

        // 5. 添加完整记录
        results.push({
          searchYear: year,
          searchFund: fundType,
          searchCode: code,
          searchKeyword: keyword,
          title,
          approveText,
          codeText,
          fundTypeText,
          personText,
          money,
          approveYear,
          endYear,
          organization,
          keywords
        });
      }
      console.log(`本页找到 ${items.length} 条数据中的有效记录数: ${results.length}`);
    }

    // 先抓取当前页
    await scrapeCurrentPage();

    // 翻页循环
    while (true) {
      const nextBtn = await page.$('button.btn-next');
      if (!nextBtn) {
        console.log('未发现下一页按钮，停止翻页');
        break;
      }
      const disabled = await nextBtn.evaluate(el => el.disabled);
      if (disabled) {
        console.log('下一页按钮不可点击，停止');
        break;
      }
      // 点击下一页
      await nextBtn.click();
      await sleep(1500); 
      // 再抓取
      await scrapeCurrentPage();
    }
  } catch (err) {
    console.error('检索或翻页时出错:', err);
  }

  // 返回本次搜索的全部结果
  return results;
}


// 3) 主函数：对 YEARS、FUND_TYPES、CODES 做多重循环
;(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  const allResults = [];

  for (const y of YEARS) {
    for (const ft of FUND_TYPES) {
      for (const c of CODES) {
        console.log(`开始搜索: year=${y}, fundType=${ft}, code=${c}, keyword=${KEYWORD}`);
        // 调用 runSearch
        const partialRes = await runSearch(page, {
          year: y,
          fundType: ft,
          code: c,
          keyword: KEYWORD
        });
        console.log(`本次获取 ${partialRes.length} 条结果`);
        allResults.push(...partialRes);
      }
    }
  }

  console.log(`所有搜索结束，共计 ${allResults.length} 条结果。准备写 CSV...`);

  // 写出 CSV
  console.log(`开始写 CSV，共 ${allResults.length} 条数据`);
  let csv = 'searchYear,searchFund,searchCode,searchKeyword,title,approveText,codeText,fundTypeText,personText,money,approveYear,endYear,organization,keywords\n';

  for (const row of allResults) {
    const lineArr = [
      row.searchYear,
      row.searchFund,
      row.searchCode,
      row.searchKeyword,
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