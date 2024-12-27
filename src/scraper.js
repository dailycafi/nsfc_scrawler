const fs = require('fs').promises;
const path = require('path');
const csv = require('csv-parser');
const { createReadStream } = require('fs');
const puppeteer = require('puppeteer');

// 全局结果数组
const results = [];

// 全局计数器
let totalResults = 0;

// 保留原有的黑名单配置
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

// 保留原有的基金类型配置
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

/** 自定义延时函数 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomSleep(min, max) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    console.log(`等待 ${delay/1000} 秒...`);
    return sleep(delay);
}

async function ensureYearDirectory(year) {
    const yearDir = path.join(__dirname, '..', 'results', year.toString());
    try {
        await fs.mkdir(yearDir, { recursive: true });
    } catch (err) {
        if (err.code !== 'EEXIST') {
            throw err;
        }
    }
    return yearDir;
}

async function readExistingData(year, code) {
    const yearDir = await ensureYearDirectory(year);
    const filePath = path.join(yearDir, `${code}.csv`);
    const existingData = new Set();

    try {
        await fs.access(filePath);
        return new Promise((resolve, reject) => {
            const results = [];
            createReadStream(filePath)
                .pipe(csv())
                .on('data', (data) => {
                    existingData.add(data.approveText);
                    results.push(data);
                })
                .on('end', () => {
                    resolve({ existingData, results });
                })
                .on('error', reject);
        });
    } catch (err) {
        return { existingData: new Set(), results: [] };
    }
}

function escapeCSV(str) {
    if (str === null || str === undefined) return '';
    str = str.toString();
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

async function saveToFile(newData, year, code) {
    if (!newData || newData.length === 0) {
        console.log('没有新数据需要保存');
        return;
    }

    const yearDir = await ensureYearDirectory(year);
    const filePath = path.join(yearDir, `${code}.csv`);
    
    // 读取现有数据
    const { existingData, results } = await readExistingData(year, code);
    
    // 过滤出新数据
    const uniqueNewData = newData.filter(item => !existingData.has(item.approveText));
    
    // 合并新旧数据
    const allData = [...results, ...uniqueNewData];
    
    if (allData.length > 0) {
        // 准备CSV内容
        const headers = Object.keys(allData[0]);
        const csvContent = [
            headers.join(','),
            ...allData.map(row => 
                headers.map(header => escapeCSV(row[header])).join(',')
            )
        ].join('\n');

        await fs.writeFile(filePath, csvContent);
        console.log(`数据已保存到: ${filePath}`);
        console.log(`新增数据条数: ${uniqueNewData.length}`);
        console.log(`总数据条数: ${allData.length}`);
        totalResults += uniqueNewData.length;
    }
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
                  await sleep(300);
                  return true;
              }
          }
      } catch (err) {
          await sleep(500);
      }
  }
  throw new Error(`未能打开部门 ${deptTitle}`);
}

// 2) 通用搜索函数
async function runSearch(page, { year, fundType, code }) {
    // 检查是否在黑名单中
    if (BLACKLIST_CODES.includes(code)) {
        console.log(`跳过黑名单代码: ${code}`);
        return [];
    }

    let results = [];
    let treeVisible = false;
    const maxRetries = 3;

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
                await sleep(1000);

                // 等待年份面板出现
                const yearPanelSelector = '.el-year-table';
                await page.waitForSelector(yearPanelSelector, { visible: true, timeout: 15000 });

                // 获取当前年份区间
                let foundYear = false;
                while (!foundYear) {
                    foundYear = await page.evaluate((targetYear) => {
                        const yearCells = Array.from(document.querySelectorAll('.el-year-table .cell'));
                        return yearCells.some(cell => cell.textContent.trim() === String(targetYear));
                    }, year);

                    if (!foundYear) {
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
                        if (document.readyState !== 'complete') return false;
                        const masks = document.querySelectorAll('.el-loading-mask');
                        if (Array.from(masks).some(mask =>
                            mask.style.display !== 'none' && getComputedStyle(mask).display !== 'none'
                        )) return false;
                        const form = document.querySelector('.el-form');
                        if (!form) return false;
                        const labels = Array.from(document.querySelectorAll('.el-form-item__label'));
                        const codeLabel = labels.find(label => label.textContent.trim() === '申请代码：');
                        if (!codeLabel) return false;
                        const formItem = codeLabel.closest('.el-form-item');
                        if (!formItem) return false;
                        const input = formItem.querySelector('input.el-input__inner');
                        if (!input) return false;
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

                    console.log('点击未成功打开树结���，将重试...');

                } catch (err) {
                    console.log(`第 ${attempt} 次尝试失败:`, err.message);
                    if (attempt < 3) {
                        console.log(`等待后重试...`);
                        await sleep(1000 * attempt);
                    }
                }
            }

            if (!treeVisible) {
                throw new Error('无法打开申请代码选择树');
            }

            // (E) 展开部门并选择代码
            try {
                // 1. 展开部门
                const deptTitle = code.startsWith('C') ? 'C 生命科学部' : 'H 医学科学部';
                await expandDepartment(page, deptTitle);
                await sleep(500);

                // 2. 展开主类
                const mainCode = code.slice(0, 3);  // 如 "C01" 或 "H01"
                await expandMainCategory(page, mainCode);
                await sleep(500);

                // 3. 选择具体代码
                const codeNodes = await page.$$('.ant-tree-title');
                let found = false;
                for (const node of codeNodes) {
                    const titleText = await node.evaluate(el => el.textContent.trim());
                    if (titleText.startsWith(code)) {
                        await node.click();
                        found = true;
                        break;
                    }
                }

                if (!found) {
                    throw new Error(`未找到代码 ${code}`);
                }

                await sleep(500);

            } catch (err) {
                console.error('选择申请代码时出错:', err);
                throw err;
            }

            // (F) 点击搜索按钮
            try {
                // 使用更精确的选择器
                const searchButton = await page.$('button.el-button.SolidBtn span');
                if (!searchButton) {
                    // 备用选择器：通过文本内容查找
                    const buttons = await page.$$('button.el-button span');
                    let found = false;
                    for (const button of buttons) {
                        const text = await button.evaluate(el => el.textContent.trim());
                        if (text === '检索') {
                            await button.click();
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        throw new Error('未找到检索按钮');
                    }
                } else {
                    await searchButton.click();
                }
                console.log('已点击检索按钮');

                // 等待搜索结果加载
                await page.waitForFunction(() => {
                    const masks = document.querySelectorAll('.el-loading-mask');
                    return Array.from(masks).every(mask => 
                        mask.style.display === 'none' || getComputedStyle(mask).display === 'none'
                    );
                }, { timeout: 30000 });

                await sleep(2000);

            } catch (err) {
                console.error('点击检索按钮或等待结果时出错:', err);
                throw err;
            }

            // (G) 抓取数据
            try {
                results = await page.evaluate(({ year, fundType, code }) => {
                    const items = Array.from(document.querySelectorAll('.info-warp'));
                    console.log(`找到 ${items.length} 个结果项`);

                    const processedApproves = new Set();

                    return items.map(item => {
                        try {
                            const row1 = item.querySelector('.el-row:nth-child(1)');
                            const row2 = item.querySelector('.el-row:nth-child(2)');
                            const row3 = item.querySelector('.el-row:nth-child(3)');
                            const row4 = item.querySelector('.el-row:nth-child(4)');

                            // 获取标题
                            const title = row1?.querySelector('.title')?.textContent?.trim() || '';

                            // 获取批准号
                            const approveText = row2?.querySelector('.el-col:nth-child(1)')?.textContent?.replace('批准号：', '')?.trim() || '';

                            // 如果没有批准号或标题，说明是无效数据
                            if (!approveText || !title) {
                                return null;
                            }

                            // 检查重复
                            if (processedApproves.has(approveText)) {
                                return null;
                            }
                            processedApproves.add(approveText);

                            // 获取申请代码
                            const codeText = row2?.querySelector('.el-col:nth-child(2)')?.textContent?.replace('申请代码：', '')?.trim() || '';

                            // 获取资助类别
                            const fundTypeText = row2?.querySelector('.el-col:nth-child(3)')?.textContent?.replace('资助类别：', '')?.trim() || '';

                            // 获取负责人
                            const personText = row3?.querySelector('.el-col:nth-child(1)')?.textContent?.replace('负责人：', '')?.trim() || '';

                            // 获取金额
                            const moneyText = row3?.querySelector('.el-col:nth-child(2)')?.textContent?.replace('金额：', '')?.trim() || '';
                            const money = moneyText ? parseFloat(moneyText) : 0;

                            // 获取批准年度
                            const approveYear = row3?.querySelector('.el-col:nth-child(3)')?.textContent?.replace('批准年度：', '')?.trim() || '';

                            // 获取结题年度
                            const endYear = row3?.querySelector('.el-col:nth-child(4)')?.textContent?.replace('结题年度：', '')?.trim() || '';

                            // 获取依托单位
                            const organization = row4?.querySelector('.el-col:nth-child(1)')?.textContent?.replace('依托单位：', '')?.trim() || '';

                            // 获取关键词
                            const keywords = row4?.querySelector('.el-col:nth-child(2)')?.textContent?.replace('关键词：', '')?.trim() || '';

                            // 验证必要字段
                            if (!title || !approveText || !codeText || !fundTypeText || !personText) {
                                console.log('跳过无效数据项');
                                return null;
                            }

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
                    }).filter(Boolean);  // 过滤掉所有 null 值
                }, { year, fundType, code });

                console.log(`成功抓取到 ${results.length} 条有效数据`);
                if (results.length > 0) {
                    console.log('第一条数据:', results[0]);
                }

                // 保存数据
                if (results && results.length > 0) {
                    await saveToFile(results, year, code);
                }

                return results;

            } catch (err) {
                console.error('抓取数据时出错:', err);
                throw err;
            }

        } catch (error) {
            console.error(`第 ${attempt} 次尝试失败:`, error);
            if (attempt === maxRetries) {
                throw error;
            }
            await sleep(3000 * attempt);
        }
    }

    return results;
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
async function getSubCodes(page, mainCode, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`尝试获取 ${mainCode} 子类代码 (第 ${attempt} 次尝试)...`);
            
            // 打开页面
            await page.goto('https://kd.nsfc.cn/finalProjectInit?advanced=true', { 
                waitUntil: 'networkidle2',
                timeout: 10000  
            });
            await page.waitForSelector('.el-collapse-item.is-active', { timeout: 10000 });
            await randomSleep(500, 1000);  // 增加等待时间

            // 点击申请代码输入框
            await page.click('label[for="code"] ~ .el-form-item__content .el-input input[readonly]');
            await randomSleep(500, 1000);

            // 等待树加载
            await page.waitForSelector('.ant-tree', { visible: true, timeout: 3000 });
            await randomSleep(500, 1000);

            // 展开部门
            const deptTitle = mainCode.startsWith('C') ? 'C 生命科学部' : 'H 医学科学部';
            await expandDepartment(page, deptTitle);
            await randomSleep(500, 1000);

            // 展开主类
            await expandMainCategory(page, mainCode);
            await randomSleep(500, 1000);

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
            
            if (subCodes.length === 0) {
                throw new Error('未获取到子类代码');
            }
            
            return subCodes;

        } catch (err) {
            console.error(`获取子类代码时出错 (${mainCode}) - 第 ${attempt} 次尝试:`, err);
            if (attempt === maxRetries) {
                console.error(`获取 ${mainCode} 的子类代码失败，已达到最大重试次数`);
                return [];
            }
            await sleep(1000 * attempt); // 重试前等待时间，每次递增
        }
    }
    return [];
}

// 主函数
async function main() {
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const year = await new Promise(resolve => {
        readline.question('请输入要爬取的年份 (例如: 2018): ', answer => {
            readline.close();
            resolve(parseInt(answer));
        });
    });

    // 验证输入的年份
    if (isNaN(year) || year < 1900 || year > new Date().getFullYear()) {
        console.error('无效的年份！');
        process.exit(1);
    }

    const YEARS = [year];
    
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--window-size=1920x1080'
        ]
    });
    const page = await browser.newPage();

    const subCodesCache = {};

    // 遍历每个主类代码
    for (const mainCode of CODES) {
        console.log(`\n开始处理主类 ${mainCode}...`);

        // 检查缓存中是否已有该主类的子类代码
        if (!subCodesCache[mainCode]) {
            const subCodes = await getSubCodes(page, mainCode);
            console.log(`${mainCode} 下获取到的子类代码：`, subCodes);
            subCodesCache[mainCode] = subCodes;
        }

        const subCodes = subCodesCache[mainCode];
        if (!subCodes || subCodes.length === 0) {
            console.error(`未能获取到 ${mainCode} 的子类代码，跳过此类`);
            continue;
        }

        // 过滤掉黑名单中的子类代码
        const validSubCodes = subCodes.filter(code => !BLACKLIST_CODES.includes(code));
        
        // 对每个有效的子类代码进行处理
        for (const subCode of validSubCodes) {
            console.log(`\n开始处理子类 ${subCode}...`);

            for (const year of YEARS) {
                for (const fundType of FUND_TYPES) {
                    console.log(`\n执行搜索: ${subCode} - ${year}年 - ${fundType}`);
                    try {
                        const results = await runSearch(page, {
                            year,
                            fundType,
                            code: subCode
                        });

                        await randomSleep(1000, 2000);
                    } catch (err) {
                        console.error(`搜索出错 (${subCode} - ${year} - ${fundType}):`, err);
                        continue;
                    }
                }
            }
        }
    }

    console.log('所有搜索完成');
    console.log(`总共处理了 ${totalResults} 条记录`);
    await browser.close();
}

// 导出需要的函数和常量
module.exports = {
    runSearch,
    BLACKLIST_CODES,
    FUND_TYPES,
    CODES,
    getSubCodes,
    expandDepartment,
    expandMainCategory,
    main
};

// 如果直接运行此文件
if (require.main === module) {
    main().catch(console.error);
}