/**
 * 以下示例使用了一个自定义 sleep(ms) 函数来替代 page.waitForTimeout(ms)，
 * 以确保在一些旧版本 Puppeteer 或特定环境里也能正常延时。
 * 与此同时，保留了"先展开后选择"的逻辑。
 */

const fs = require('fs');
const puppeteer = require('puppeteer');

// 添加全局结果数组
const results = [];

// 添加全局计数器
let totalResults = 0;

// 添加黑名单配置
const BLACKLIST_CODES = [
  'C0301', 'H0611', 'H2804', 'H0113', 'C1904', 'C1909', 'H3407',
  'H1004', 'H2208', 'H2805', 'H3012', 'H1007', 'C1701', 'H3102',
  'H2809', 'H1010', 'H1309', 'C1312', 'C1613', 'H1404', 'H2501',
  'H1707', 'C0405', 'H3408', 'H3204', 'C0909', 'C1611', 'H2711',
  'H0605', 'H1507', 'H3101', 'C1607', 'H2303', 'H2801', 'H3411',
  'H1008', 'H0418', 'H3201', 'C0607', 'H0417', 'H0422', 'C0306',
  'C0312', 'C0101', 'H3207', 'C0908', 'C1902', 'C0910', 'H1011',
  'C2009', 'H3120', 'H2502', 'H3410', 'H2003', 'H3513', 'C0208',
  'H1903', 'H2605', 'H2813', 'H1509', 'C1614', 'H0106', 'H2808',
  'H1003', 'C0914', 'H0315', 'H2604', 'C1505', 'H1206', 'H3109',
  'H0210', 'H3412', 'H2802', 'H3404', 'H3104', 'H0420', 'H1508',
  'H0218', 'C1612', 'H3118', 'H3007', 'H1506', 'H0908', 'C1511',
  'C1507', 'H2814', 'H0314', 'H1009', 'H3014', 'H0208', 'H0610',
  'H3303', 'H1705', 'H3409', 'H3302', 'C0201', 'H2812', 'C0304',
  'C1604', 'H0506', 'H2606', 'H1814', 'C0606', 'H0511', 'C1609',
  'H2806', 'H0114', 'H0419', 'H1308', 'C0402', 'C0305', 'H1005',
  'H0905', 'H1505', 'H3114', 'H0816', 'H3206', 'H0603', 'H3205',
  'H0104', 'H0412', 'C1301', 'H2402', 'H0903', 'C1307', 'H1503',
  'C1303', 'H2209', 'H0904', 'H0915', 'H1706', 'C1608', 'H2811',
  'H1402', 'H3105', 'C1610', 'H0105', 'H0303', 'H0510', 'H1006',
  'H0112', 'C0313', 'H0913', 'H3103', 'H0204', 'C0302', 'C1702',
  'H0509', 'H0508', 'H3009', 'H2603', 'C1601', 'H3202', 'C1502',
  'H0220', 'H1403', 'H0902', 'H1504', 'H1301', 'C1509', 'C0308',
  'H1401', 'H3119', 'H0507', 'H2803', 'H0108', 'C0307', 'H3219',
  'H1406', 'H3107', 'H3208', 'H3106', 'C1703', 'C1006', 'H3121',
  'H2504', 'C1302', 'C1603', 'H2807', 'C1306', 'H3301', 'H1405',
  'H3008'];

/** 自定义延时函数 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 添加随机延时函数
function randomSleep(min, max) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  console.log(`等待 ${delay/1000} 秒...`);
  return sleep(delay);
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
  // C 生命科学部 (C11-C21)
  ...Array.from({length: 11}, (_, i) => `C${String(i + 11).padStart(2, '0')}`),
  // H 医学科学部 (H01-H35)
  ...Array.from({length: 35}, (_, i) => `H${String(i + 1).padStart(2, '0')}`)
];

// 2) 通用搜索函数
async function runSearch(page, { year, fundType, code }) {
  // 检查是否在黑名单中
  if (BLACKLIST_CODES.includes(code)) {
    console.log(`跳过黑名单代码: ${code}`);
    return [];
  }

  let results = [];
  let treeVisible = false;
  const maxRetries = 3; // 最大重试次数

  console.log(`--> runSearch 开始: year=${year}, fundType=${fundType}, code=${code}`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // (A) 打开页面并等待加载完成
      await page.goto('https://kd.nsfc.cn/finalProjectInit?advanced=true', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // 等待高级搜索面板加载
      await page.waitForSelector('.el-collapse-item.is-active', { timeout: 15000 });
      await sleep(2000);

      // (B) 选择结题年度
      try {
        const yearInputSelector = '.el-form-item__content .el-date-editor--year .el-input__inner';
        await page.waitForSelector(yearInputSelector, { visible: true });
        await page.click(yearInputSelector);
        await sleep(1000);  // 增加等待时间

        // 等待年份面板出现
        const yearPanelSelector = '.el-year-table';
        await page.waitForSelector(yearPanelSelector, { visible: true, timeout: 15000 });

        // 获取当前年份区间
        let foundYear = false;
        while (!foundYear) {
          // 检查当前面板是否包含目标年份
          foundYear = await page.evaluate((targetYear) => {
            const yearCells = Array.from(document.querySelectorAll('.el-year-table .cell'));
            return yearCells.some(cell => cell.textContent.trim() === String(targetYear));
          }, year);

          if (!foundYear) {
            // 点击左箭头切换到前一个年份区间
            await page.click('.el-date-picker__prev-btn.el-icon-d-arrow-left');
            await sleep(500);
          }
        }

        // 选择目标年份
        await page.evaluate((targetYear) => {
          const yearCells = Array.from(document.querySelectorAll('.el-year-table .cell'));
          for (const cell of yearCells) {
            if (cell.textContent.trim() === String(targetYear)) {
              cell.click();
              return true;
            }
          }
          return false;
        }, year);

        await sleep(1000);
      } catch (err) {
        console.error(`选择年度 ${year} 时出错:`, err);
      }

      // (C) 选择资助类别
      try {
        const fundInputSelector = 'label[for="projectType"] + .el-form-item__content .el-input';
        await page.waitForSelector(fundInputSelector, { visible: true, timeout: 2000 });
        await page.click(fundInputSelector);

        const dropdownSelector = '.el-select-dropdown';
        await page.waitForSelector(dropdownSelector, { visible: true, timeout: 2000 });

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
      console.log('准备点击申请代码输入框...');

      treeVisible = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`第 ${attempt} 次尝试...`);

          // 1. 等待页面完全加载
          await page.waitForFunction(() => {
            // 检查页面是否完全加载
            if (document.readyState !== 'complete') return false;

            // 检查是否有加载遮罩
            const masks = document.querySelectorAll('.el-loading-mask');
            if (Array.from(masks).some(mask =>
              mask.style.display !== 'none' && getComputedStyle(mask).display !== 'none'
            )) return false;

            // 检查表单是否存在
            const form = document.querySelector('.el-form');
            if (!form) return false;

            // 检查输入框是否存在且可见
            const labels = Array.from(document.querySelectorAll('.el-form-item__label'));
            const codeLabel = labels.find(label => label.textContent.trim() === '申请代码：');
            if (!codeLabel) return false;

            const formItem = codeLabel.closest('.el-form-item');
            if (!formItem) return false;

            const input = formItem.querySelector('input.el-input__inner');
            if (!input) return false;

            // 检查元素是否真的可见
            const rect = input.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }, { timeout: 5000 });

          console.log('页面已备就绪');
          await randomSleep(500, 1000);

          // 2. 尝试点击
          const clicked = await page.evaluate(() => {
            const labels = Array.from(document.querySelectorAll('.el-form-item__label'));
            const codeLabel = labels.find(label => label.textContent.trim() === '申请代码：');
            if (!codeLabel) return false;

            const formItem = codeLabel.closest('.el-form-item');
            if (!formItem) return false;

            const input = formItem.querySelector('input.el-input__inner');
            if (!input) return false;

            // 尝试多种点击方式
            input.click();
            input.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            input.focus();
            return true;
          });

          if (!clicked) {
            throw new Error('未找到可点击的输入框');
          }

          await randomSleep(500, 1000);

          // 3. 检查树是否出现
          treeVisible = await page.evaluate(() => {
            const tree = document.querySelector('.ant-tree');
            return !!tree && tree.children.length > 0;
          });

          if (treeVisible) {
            console.log('成功点击并确认树结构已出现');
            break;
          }

          console.log('点击未成功打开树结构，将重试...');

        } catch (err) {
          console.log(`第 ${attempt} 次尝试失败:`, err.message);
          if (attempt < 3) {
            console.log(`等待后重试...`);
            await sleep(1000 * attempt);
          }
        }
      }

      if (!treeVisible) {
        throw new Error('无法打开申请代码树结构');
      }

      await sleep(1000);

      // 确保树结构完全加载
      await page.waitForFunction(() => {
        const tree = document.querySelector('.ant-tree');
        return tree && tree.children.length > 0;
      }, { timeout: 1000 });

      // 1. 展开部门
      const deptTitle = code.startsWith('C') ? 'C 生命科学部' : 'H 医学科学部';
      await expandDepartment(page, deptTitle);
      await randomSleep(500, 1000);

      // 2. 展开主类
      const mainCode = code.substring(0, 3);
      await expandMainCategory(page, mainCode);
      await sleep(1000);

      // 3. 选择具体的申请代码
      console.log(`准备选择申请代码: ${code}`);
      const selected = await page.evaluate((targetCode) => {
        const allTitles = Array.from(document.querySelectorAll('.ant-tree-title'));
        for (const title of allTitles) {
          const text = title.textContent.trim();
          if (text.startsWith(targetCode + ' ')) {
            const wrapper = title.closest('.ant-tree-node-content-wrapper');
            if (wrapper) {
              wrapper.click();
              return true;
            }
          }
        }
        return false;
      }, code);

      if (!selected) {
        throw new Error(`未能选中申请代码 ${code}`);
      }

      console.log(`成功选择申请代码 ${code}`);
      await sleep(500);

      // 关闭申请代码选择框
      await page.keyboard.press('Escape');

      await sleep(500);

      // 点击搜索按钮
      console.log('点击搜索按钮...');
      const searchBtnSelector = 'button.el-button.SolidBtn span';
      await page.waitForSelector(searchBtnSelector, { visible: true, timeout: 5000 });

      // 确保按钮可点击
      await page.evaluate(() => {
        const btn = document.querySelector('button.el-button.SolidBtn');
        if (btn && btn.textContent.trim() === '检索') {
          btn.click();
        }
      });

      await randomSleep(1000, 2000);

      // 等待搜索结果加载
      try {
        await page.waitForFunction(() => {
          const masks = document.querySelectorAll('.el-loading-mask');
          return Array.from(masks).every(mask =>
            !mask.style.display || mask.style.display === 'none'
          );
        }, { timeout: 8000 });
      } catch (err) {
        console.log('等待搜索结果加载超时');
      }

      // 检查是否有结果
      const hasResults = await page.evaluate(() => {
        const items = document.querySelectorAll('.info-warp');
        return items.length > 0;
      });

      if (!hasResults) {
        console.log('未找到搜索结果');
        return [];
      }

      console.log('找到搜索结果，等待页面稳定...');
      await sleep(2000);

      // 确保页面稳定，检查结果是否还存在
      const resultsStable = await page.evaluate(() => {
        const items = document.querySelectorAll('.info-warp');
        return items.length > 0;
      });

      if (!resultsStable) {
        console.log('搜索结果不稳定，重试...');
        return [];
      }

      // 处理分页
      const results = [];
      while (true) {
        // 再次确认当前页有结果
        const currentPageHasResults = await page.evaluate(() => {
          const items = document.querySelectorAll('.info-warp');
          return items.length > 0;
        });

        if (!currentPageHasResults) {
          console.log('当前页结果异常，停止处理');
          break;
        }

        // 抓取当前页数据
        const pageResults = await scrapeCurrentPage(page, { year, fundType, code });
        console.log(`当前页抓取到 ${pageResults.length} 条数据`);

        if (pageResults.length === 0) {
          console.log('当前页数据，停止翻页');
          break;
        }

        results.push(...pageResults);

        // 检查是否有下一页
        const hasNextPage = await page.evaluate(() => {
          const btn = document.querySelector('button.btn-next');
          return btn && !btn.hasAttribute('disabled') && !btn.disabled;
        });

        if (!hasNextPage) {
          console.log('没有下一页了');
          break;
        }

        console.log('点击下一页...');
        await page.click('button.btn-next');
        await sleep(2000);

        // 等待新数据加载
        try {
          await page.waitForFunction(() => {
            const masks = document.querySelectorAll('.el-loading-mask');
            return Array.from(masks).every(mask =>
              !mask.style.display || mask.style.display === 'none'
            );
          }, { timeout: 8000 });
        } catch (err) {
          console.log('等待新数据加载失败');
          break;
        }
      }

      console.log(`${code} - ${year}年 - ${fundType} 共获取到 ${results.length} 条数据`);
      return results;

    } catch (err) {
      console.error(`第 ${attempt} 次尝试失败:`, err.message);

      if (attempt === maxRetries) {
        console.error(`处理申请代码 "${code}" 时出错，已达到最大重试次数`);
        return [];
      }

      // 在重试之前等待一段时间
      await sleep(3000 * attempt); // 逐次增加等待时间
      console.log(`准备第 ${attempt + 1} 次尝试...`);
    }
  }

  // 过滤掉空数据
  return results.filter(r => r.title && r.approveText);
}

// 添加抓取当前页面数据的函数
async function scrapeCurrentPage(page, { year, fundType, code }) {
  console.log('开始抓取当前页数据...');

  try {
    await page.waitForSelector('.info-warp', { timeout: 10000 });

    const results = await page.evaluate(({ year, fundType, code }) => {
      const items = Array.from(document.querySelectorAll('.info-warp'));
      console.log(`找到 ${items.length} 个结果项`);

      // 用 Set 来存储已处理的批准号，避免重复
      const processedApproves = new Set();

      return items.map(item => {
        try {
          // 获取基本信息 (第二行)
          const row2 = item.querySelector('.el-row:nth-child(2)');
          const approveText = row2?.querySelector('.el-col:nth-child(1)')?.textContent?.replace('批准号：', '')?.trim() || '';

          // 如果这个批准号已经处理过，跳过
          if (processedApproves.has(approveText)) {
            return null;
          }
          processedApproves.add(approveText);

          // 获取标题 (第一行)
          const title = item.querySelector('.el-row:first-child .el-col-21 a')?.textContent?.trim() || '';

          const codeText = row2?.querySelector('.el-col:nth-child(2)')?.textContent?.replace('申请代码：', '')?.trim() || '';
          const fundTypeText = row2?.querySelector('.el-col:nth-child(3)')?.textContent?.replace('项目类别：', '')?.trim() || '';
          // 修正：正确获取项目负责人
          const personText = row2?.querySelector('.el-col:nth-child(4)')?.textContent?.replace('项目负责人：', '')?.trim() || '';

          // 获取详细信息 (第三行)
          const row3 = item.querySelector('.el-row:nth-child(3)');
          const money = row3?.querySelector('.el-col:nth-child(1)')?.textContent?.replace('资助经费：', '')?.replace('（万元）', '')?.trim() || '';
          const approveYear = row3?.querySelector('.el-col:nth-child(2)')?.textContent?.replace('批准年度：', '')?.trim() || '';
          const endYear = row3?.querySelector('.el-col:nth-child(3)')?.textContent?.replace('结题年度：', '')?.trim() || '';
          const organization = row3?.querySelector('.el-col:nth-child(4)')?.textContent?.replace('依托单位：', '')?.trim() || '';

          // 获取关键词 (第四行)
          const keywordsText = item.querySelector('.el-row:nth-child(4) .el-col-24')?.textContent || '';
          const keywords = keywordsText.replace('关键词：', '').trim();

          return {
            searchYear: year,
            searchFund: fundType,
            searchCode: code,
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
          };
        } catch (err) {
          console.error('解析单个项目时出错:', err);
          return null;
        }
      }).filter(Boolean); // 过滤掉 null 值
    }, { year, fundType, code });

    console.log(`成功抓取到 ${results.length} 条数据`);
    if (results.length > 0) {
      console.log('第一条数据:', results[0]);
    }

    return results;

  } catch (err) {
    console.error('抓取页面数据时出错:', err);
    return [];
  }
}

// 添加保存结果到 CSV 的函数
async function saveResultsToCSV(results, mainCode, subCode) {
  // 如果结果为空，直接返回
  if (!results || results.length === 0) {
    console.log('没有数据需要保存');
    return;
  }

  // 过滤掉空数据
  const validResults = results.filter(row => {
    return row.title || row.approveText || row.personText || row.organization;
  });

  if (validResults.length === 0) {
    console.log('过滤空数据后没有有效记录需要保存');
    return;
  }

  console.log(`准备保存 ${validResults.length} 条有效记录...`);

  // 修改主目录路径
  const mainDir = `./22_23/${mainCode}`;
  if (!fs.existsSync('./22_23')) {
    fs.mkdirSync('./22_23');
  }
  if (!fs.existsSync(mainDir)) {
    fs.mkdirSync(mainDir);
  }

  const filename = `${mainDir}/${subCode}.csv`;

  // 读取现有数据（如果文件存在）
  let existingData = [];
  let startIndex = 1;

  if (fs.existsSync(filename)) {
    console.log('读取现有文件...');
    const content = fs.readFileSync(filename, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length > 1) { // 如果有数据行（不只是表头）
      existingData = lines.slice(1);
      // 获取最后一行的序号
      const lastLine = existingData[existingData.length - 1];
      if (lastLine) {
        const lastIndex = parseInt(lastLine.split(',')[0].replace(/"/g, ''));
        if (!isNaN(lastIndex)) {
          startIndex = lastIndex + 1;
        }
      }
      console.log(`读取到 ${existingData.length} 条现有记录，新数据起始序号: ${startIndex}`);
    }
  }

  // 准备新数据
  const newLines = validResults.map((row, index) => {
    const currentIndex = startIndex + index;
    const lineArr = [
      currentIndex,
      row.approveText,
      row.title,
      row.searchYear,
      row.searchFund,
      row.searchCode,
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
    return lineArr.join(',');
  });

  // 合并所有数据
  const allData = [...existingData, ...newLines];

  // 写入文件
  const header = 'index,approveText,title,searchYear,searchFund,searchCode,codeText,fundTypeText,personText,money,approveYear,endYear,organization,keywords\n';
  const content = header + allData.join('\n') + '\n';
  fs.writeFileSync(filename, content, 'utf-8');

  console.log(`已保存 ${allData.length} 条记录到 ${filename}`);
  totalResults += validResults.length;
}

// 展开部门的辅助函数
async function expandDepartment(page, deptTitle, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const deptNodes = await page.$$('.ant-tree-title');
      for (const node of deptNodes) {
        const titleText = await node.evaluate(el => el.textContent.trim());
        if (titleText === deptTitle) {
          await node.evaluate(el =>
            el.parentElement.previousElementSibling.click());
          await sleep(300); // 减少等待时间
          return true;
        }
      }
    } catch (err) {
      await sleep(500); // 减少重试等待时间
    }
  }
  throw new Error(`未能打开部门 ${deptTitle}`);
}

// 展开主类的辅助函数
async function expandMainCategory(page, mainCode) {
  const mainNodes = await page.$$('.ant-tree-title');
  for (const node of mainNodes) {
    const titleText = await node.evaluate(el => el.textContent.trim());
    if (titleText.startsWith(mainCode)) {
      await node.evaluate(el =>
        el.parentElement.previousElementSibling.click());
      await sleep(300); // 减少等待时间
      break;
    }
  }
}

// 获取子类代码的函数
async function getSubCodes(page, mainCode) {
  try {
    // 打开页面
    await page.goto('https://kd.nsfc.cn/finalProjectInit?advanced=true', { waitUntil: 'networkidle2' });
    await page.waitForSelector('.el-collapse-item.is-active', { timeout: 10000 });

    // 点击申请代码输入框
    await page.click('label[for="code"] ~ .el-form-item__content .el-input input[readonly]');
    await sleep(1000);

    // 等待树加载
    await page.waitForSelector('.ant-tree', { visible: true, timeout: 2000 });
    await sleep(500);

    // 展开对部门
    const deptTitle = mainCode.startsWith('C') ? 'C 生命科学部' : 'H 医学科学部';
    await expandDepartment(page, deptTitle);
    await sleep(500);

    // 展开主类
    await expandMainCategory(page, mainCode);
    await sleep(1000);

    // 获取子类代码
    const subCodes = await page.evaluate((mainCode) => {
      const mainTitle = Array.from(document.querySelectorAll('.ant-tree-title'))
        .find(el => el.textContent.trim().startsWith(mainCode));

      if (!mainTitle) return [];

      const mainLi = mainTitle.closest('li');
      if (!mainLi) return [];

      const subItems = mainLi.querySelectorAll(':scope > ul.ant-tree-child-tree > li');

      return Array.from(subItems)
        .map(item => {
          const title = item.querySelector('.ant-tree-title');
          if (!title) return null;
          return title.textContent.trim().split(' ')[0];
        })
        .filter(Boolean);
    }, mainCode);

    // 关闭申请代码选择框
    await page.keyboard.press('Escape');
    return subCodes;

  } catch (err) {
    console.error(`获取子类代码时出错 (${mainCode}):`, err);
    return [];
  }
}

// 主函数：对 YEARS、FUND_TYPES、CODES 做多重循环
;(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // 创建个缓存对象存储已获取的子类代码
  const subCodesCache = {};

  // 遍历每个主类代码（如 C01, C02 等）
  for (const mainCode of CODES) {
    console.log(`\n开始处理主类 ${mainCode}...`);

    // 检查缓存是否已该主的子类代码
    if (!subCodesCache[mainCode]) {
      // 首先获取该主类下的所有子类代码
      const subCodes = await getSubCodes(page, mainCode);
      console.log(`${mainCode} 下获取到的子类代码：`, subCodes);
      subCodesCache[mainCode] = subCodes;
    }

    const subCodes = subCodesCache[mainCode];
    if (!subCodes || subCodes.length === 0) {
      console.error(`未能获取到 ${mainCode} 的子类代码，过此类`);
      continue;
    }

    // 对每个子类代码进行年份和资助类型的遍历
    for (const subCode of subCodes) {
      console.log(`\n开始处理子类 ${subCode}...`);

      // 对每个子类，遍历所有年份和资助类型的组合
      for (const year of YEARS) {
        for (const fundType of FUND_TYPES) {
          console.log(`\n执行搜索: ${subCode} - ${year}年 - ${fundType}`);

          try {
            // 每次搜索都重新开始
            const results = await runSearch(page, {
              year,
              fundType,
              code: subCode
            });

            // 保存当前搜索结果
            await saveResultsToCSV(results, mainCode, subCode);

            // 简单延时，避免请求过快
            await randomSleep(1000, 2000); // 1-2秒随机延时
          } catch (err) {
            console.error(`搜索出错 (${subCode} - ${year} - ${fundType}):`, err);
            // 继续下一个组合
            continue;
          }
        }
      }
    }
  }

  console.log('所有搜索完成');
  console.log(`总共处理了 ${totalResults} 条记录`);
  // await browser.close();
})();