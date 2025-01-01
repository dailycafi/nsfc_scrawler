const puppeteer = require('puppeteer');
const ProgressTracker = require('./progressTracker');
const { sleep, randomSleep, saveToFile, generateRandomUA } = require('./utils');
const { FUND_TYPES } = require('./config');

// 添加一个通用的重试函数
async function retryOperation(operation, maxRetries = 3, description = '') {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            console.error(`${description} 失败 (尝试 ${i + 1}/${maxRetries}):`, error.message);
            if (i === maxRetries - 1) throw error;
            await randomSleep(1000 * (i + 1), 2000 * (i + 1)); // 递增等待时间
        }
    }
}

// 修改选择资助类别的部分
async function selectFundType(page, fundType) {
    return retryOperation(async () => {
        // 1. 等待页面定
        await page.waitForFunction(() => {
            const loadingMasks = document.querySelectorAll('.el-loading-mask');
            return Array.from(loadingMasks).every(mask =>
                getComputedStyle(mask).display === 'none'
            );
        }, { timeout: 10000 });

        await randomSleep(500, 1000);

        // 2. 使用正确的选择器找到资助类别输入框
        const inputSelector = 'label[for="projectType"] + .el-form-item__content .el-input__inner';
        await page.waitForSelector(inputSelector, {
            visible: true,
            timeout: 500
        });

        // 3. 点击输入框
        await page.click(inputSelector);
        await randomSleep(300, 500);

        // 4. 等待下拉菜单出现
        const dropdownSelector = '.el-select-dropdown.theSelector';
        await page.waitForSelector(dropdownSelector, {
            visible: true,
            timeout: 5000
        });

        // 5. 选择目标选项
        const selected = await page.evaluate((targetFundType) => {
            const options = Array.from(document.querySelectorAll('.el-select-dropdown.theSelector .el-select-dropdown__item span'));
            for (const option of options) {
                if (option.textContent.trim() === targetFundType) {
                    option.parentElement.click();
                    return true;
                }
            }
            return false;
        }, fundType);

        if (!selected) {
            throw new Error(`未找到资助类别选项: ${fundType}`);
        }

        await randomSleep(300, 500);
        return true;
    }, 3, '选择资助类别');
}

// 修改检查节点展开状态的辅助函数
async function isNodeExpanded(node) {
    return await node.evaluate(el => {
        const switcher = el.parentElement.previousElementSibling;
        return switcher.classList.contains('ant-tree-switcher_open');
    });
}

// 修改展开学部的函数
async function expandDivision(page, divisionTitle) {
    const divisionNodes = await page.$$('.ant-tree-title');
    for (const node of divisionNodes) {
        const titleText = await node.evaluate(el => el.textContent.trim());
        if (titleText === divisionTitle) {
            // 检查学部节点是否已经展开
            const expanded = await isNodeExpanded(node);
            console.log(`学部 ${divisionTitle} 当前状态: ${expanded ? '已展开' : '未展开'}`);
            
            if (!expanded) {
                await node.evaluate(el =>
                    el.parentElement.previousElementSibling.click());
                await sleep(300);
                
                // 检查展开后的状态
                const newExpanded = await isNodeExpanded(node);
                console.log(`学部 ${divisionTitle} 展开操作后状态: ${newExpanded ? '已展开' : '未展开'}`);
            }
            return true;
        }
    }
    return false;
}

// 修改展开主类的函数
async function expandMainCategory(page, mainCode) {
    const mainNodes = await page.$$('.ant-tree-title');
    for (const node of mainNodes) {
        const titleText = await node.evaluate(el => el.textContent.trim());
        if (titleText.startsWith(mainCode)) {
            // 检查主类节点是否已经展开
            const expanded = await isNodeExpanded(node);
            console.log(`主类 ${mainCode} 当前状态: ${expanded ? '已展开' : '未展开'}`);
            
            if (!expanded) {
                await node.evaluate(el =>
                    el.parentElement.previousElementSibling.click());
                await randomSleep(200,300);
                
                // 检查展开后的状态
                const newExpanded = await isNodeExpanded(node);
                console.log(`主类 ${mainCode} 展开操作后状态: ${newExpanded ? '已展开' : '未展开'}`);
            }
            return true;
        }
    }
    return false;
}

// 新增：获取申请代码输入框的值
async function getCodeInputValue(page) {
    return await page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll('.el-form-item__label'));
        const codeLabel = labels.find(label => label.textContent.trim() === '申请代码：');
        if (!codeLabel) return null;
        const formItem = codeLabel.closest('.el-form-item');
        if (!formItem) return null;
        const input = formItem.querySelector('input.el-input__inner');
        if (!input) return null;
        return input.value;
    });
}

// 修改 selectCode 函数，添加代码匹配验证
async function selectCode(page, code) {
    try {
        // 等待元素可见
        await page.waitForFunction((targetCode) => {
            const nodes = document.querySelectorAll('.ant-tree-title');
            return Array.from(nodes).some(node => 
                node.textContent.trim().startsWith(targetCode));
        }, { timeout: 5000 }, code);

        // 获取点击前的值
        const beforeValue = await getCodeInputValue(page);
        console.log(`选择代码前输入框的值: "${beforeValue}"`);

        // 点击代码
        const clicked = await page.evaluate((targetCode) => {
            const nodes = document.querySelectorAll('.ant-tree-title');
            for (const node of nodes) {
                if (node.textContent.trim().startsWith(targetCode)) {
                    const wrapper = node.closest('.ant-tree-node-content-wrapper');
                    if (wrapper) {
                        wrapper.dispatchEvent(new MouseEvent('click', {
                            view: window,
                            bubbles: true,
                            cancelable: true,
                            buttons: 1
                        }));
                        return true;
                    }
                }
            }
            return false;
        }, code);

        if (!clicked) {
            console.log(`未能点击代码: ${code}`);
            return false;
        }

        // 等待值更新
        await randomSleep(300, 500);
        
        // 验证点击后的值
        const afterValue = await getCodeInputValue(page);
        console.log(`选择代码后输入框的值: "${afterValue}"`);

        // 验证代码匹配
        if (afterValue) {
            const selectedCode = afterValue.split(' ')[0]; // 获取空格前的代码部分
            const isMatched = selectedCode === code;
            console.log(`代码匹配验证: 期望=${code}, 实际=${selectedCode}, 匹配结果=${isMatched}`);
            
            if (!isMatched) {
                console.log('代码不匹配，准备重试...');
                // 重新点击输入框，关闭当前树
                await page.evaluate(() => {
                    const labels = Array.from(document.querySelectorAll('.el-form-item__label'));
                    const codeLabel = labels.find(label => label.textContent.trim() === '申请代码：');
                    if (!codeLabel) return;
                    const formItem = codeLabel.closest('.el-form-item');
                    if (!formItem) return;
                    const input = formItem.querySelector('input.el-input__inner');
                    if (!input) return;
                    input.click();
                    input.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                });
                await randomSleep(500, 800);
                return false;
            }
            
            return true;
        }

        return false;
    } catch (error) {
        console.error(`选择代码 ${code} 时出错:`, error);
        return false;
    }
}

// 1. 处理搜索面板加载
async function waitForSearchPanel(page) {
    console.log(`等待高级搜索面板...`);
    await page.waitForFunction(() => {
        const panel = document.querySelector('.el-collapse-item.is-active');
        if (!panel) return false;

        const form = panel.querySelector('.el-form');
        if (!form) return false;

        const yearInput = form.querySelector('label[for="conclusionYear"]');
        const typeInput = form.querySelector('label[for="projectType"]');
        const codeInput = form.querySelector('label[for="code"]');

        return yearInput && typeInput && codeInput;
    }, {
        timeout: 15000,
        polling: 1000
    });
    await randomSleep(300, 500);
}

// 2. 处理年份选择
async function selectYear(page, year) {
    try {
        const yearInputSelector = '.el-form-item__content .el-date-editor--year .el-input__inner';
        await page.waitForSelector(yearInputSelector, { visible: true });
        await page.click(yearInputSelector);
        await randomSleep(300, 500);

        const yearPanelSelector = '.el-year-table';
        await page.waitForSelector(yearPanelSelector, { visible: true, timeout: 15000 });

        let foundYear = false;
        while (!foundYear) {
            foundYear = await page.evaluate((targetYear) => {
                const yearCells = Array.from(document.querySelectorAll('.el-year-table .cell'));
                return yearCells.some(cell => cell.textContent.trim() === String(targetYear));
            }, year);

            if (!foundYear) {
                await page.click('.el-date-picker__prev-btn.el-icon-d-arrow-left');
                await randomSleep(200, 300);
            }
        }

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

        await randomSleep(300, 500);
    } catch (err) {
        console.error(`选择年度时出错:`, err);
        throw err;
    }
}

// 3. 处理申请代码树的显示
async function openCodeTree(page) {
    console.log('准备点击申请代码输入框...');
    
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            console.log(`第 ${attempt} 次尝试...`);
            
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

            console.log('页面已就绪');
            await randomSleep(500, 800);

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

            await randomSleep(500, 800);

            const treeVisible = await page.evaluate(() => {
                const tree = document.querySelector('.ant-tree');
                return !!tree && tree.children.length > 0;
            });

            if (treeVisible) {
                console.log('成功点击并确认树结构已出现');
                return true;
            }

            console.log('点击成功但树结构未出现，将重试...');
        } catch (err) {
            console.log(`第 ${attempt} 次尝试失败:`, err.message);
            if (attempt < 3) {
                await sleep(800 * attempt);
            }
        }
    }
    
    throw new Error('无法打开申请代码选择树');
}

// 4. 点击搜索按钮并等待结果
async function clickSearchAndWait(page) {
    const searchButton = await page.$('button.el-button.SolidBtn span');
    if (!searchButton) {
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

    const { hasResults, totalItems } = await waitForPageLoad(page);
    if (!hasResults) {
        return { hasResults: false, totalItems: 0 };
    }

    console.log(`找到 ${totalItems} 条结果`);
    await sleep(2000);
    return { hasResults: true, totalItems };
}

// 5. 处理搜索结果的获取和解析
async function processSearchResults(page, { year, fundType, code }) {
    let allResults = [];
    let currentPage = 1;
    
    const totals = await page.evaluate(() => {
        const totalSpan = document.querySelector('span[style="font-size: 16px;"]');
        const totalText = totalSpan?.textContent?.match(/\d+/)?.[0] || '0';

        const paginationTotal = document.querySelector('.el-pagination__total');
        const pagesMatch = paginationTotal?.textContent?.match(/共(\d+)页/);
        const totalPages = pagesMatch ? parseInt(pagesMatch[1]) : 1;

        return {
            items: parseInt(totalText),
            pages: totalPages
        };
    });

    const totalItems = totals.items;
    const totalPages = totals.pages;
    console.log(`找到总共 ${totalItems} 条结果，共 ${totalPages} 页`);

    while (currentPage <= totalPages) {
        console.log(`正在处理第 ${currentPage}/${totalPages} 页...`);

        const pageResults = await page.evaluate(({ year, fundType, code }) => {
            const items = Array.from(document.querySelectorAll('.info-warp'));
            const processedApproves = new Set();

            function processTitle(title) {
                const match = title.match(/^(\d+)\.(.+)$/);
                if (match) {
                    return {
                        number: match[1],
                        title: match[2].trim()
                    };
                }
                return {
                    number: '',
                    title: title.trim()
                };
            }

            function standardizeKeywords(keywords) {
                if (!keywords) return '';
                keywords = keywords.replace(/^关键词：/, '');
                return keywords
                    .split(/[；;、。.．]+/)
                    .map(k => k.trim())
                    .filter(k => k)
                    .join('; ');
            }

            return items.map(item => {
                try {
                    const rawTitle = item.querySelector('.el-row:nth-child(1) a')?.textContent?.trim() || '';
                    const { number: id, title } = processTitle(rawTitle);

                    const row2 = item.querySelector('.el-row:nth-child(2)');
                    const approveText = row2?.querySelector('.el-col:nth-child(1)')?.textContent?.replace('批准号：', '')?.trim() || '';
                    const codeText = row2?.querySelector('.el-col:nth-child(2)')?.textContent?.replace('申请代码：', '')?.trim() || '';
                    const fundTypeText = row2?.querySelector('.el-col:nth-child(3)')?.textContent?.replace('项目类别：', '')?.trim() || '';
                    const personText = row2?.querySelector('.el-col:nth-child(4)')?.textContent?.replace('项目负责人：', '')?.trim() || '';

                    const row3 = item.querySelector('.el-row:nth-child(3)');
                    const moneyText = row3?.querySelector('.el-col:nth-child(1)')?.textContent?.replace('资助经费：', '').replace('（万元）', '')?.trim() || '';
                    const money = moneyText ? parseFloat(moneyText) : 0;
                    const approveYear = row3?.querySelector('.el-col:nth-child(2)')?.textContent?.replace('批准年度：', '')?.trim() || '';
                    const endYear = row3?.querySelector('.el-col:nth-child(3)')?.textContent?.replace('结题年度：', '')?.trim() || '';
                    const organization = row3?.querySelector('.el-col:nth-child(4) a')?.textContent?.trim() || '';

                    const row4 = item.querySelector('.el-row:nth-child(4)');
                    const rawKeywords = row4?.querySelector('.el-col')?.textContent?.replace('关键词：', '')?.trim() || '';
                    const keywords = standardizeKeywords(rawKeywords);

                    if (!approveText || !title) return null;
                    if (processedApproves.has(approveText)) return null;
                    processedApproves.add(approveText);

                    return {
                        searchYear: year,
                        searchFund: fundType,
                        searchCode: code,
                        id,
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
            }).filter(Boolean);
        }, { year, fundType, code });

        allResults = allResults.concat(pageResults);
        console.log(`第 ${currentPage} 页抓取到 ${pageResults.length} 条数据`);

        if (currentPage < totalPages) {
            const nextButton = await page.$('button.btn-next');
            if (!nextButton) {
                throw new Error('未找到下一页按钮');
            }
            await nextButton.click();
            await sleep(2000);

            await page.waitForFunction(() => {
                const masks = document.querySelectorAll('.el-loading-mask');
                return Array.from(masks).every(mask =>
                    mask.style.display === 'none' || getComputedStyle(mask).display === 'none'
                );
            }, { timeout: 30000 });
        }

        currentPage++;
    }

    return {
        results: allResults,
        count: allResults.length
    };
}

// 修改后的主搜索函数
async function runSearch(page, { year, fundType, code }) {
    let results = [];
    const maxRetries = 3;

    console.log(`--> runSearch 开始: year=${year}, fundType=${fundType}, code=${code}`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // 1. 等待搜索面板加载
            await waitForSearchPanel(page);

            // 2. 选择结题年度
            await selectYear(page, year);

            // 3. 选择资助类别
            await selectFundType(page, fundType);

            // 4. 处理代码选择
            let codeSelected = false;
            while (!codeSelected && attempt <= maxRetries) {
                // 4.1 打开代码树
                const treeOpened = await openCodeTree(page);
                if (!treeOpened) {
                    console.log('打开代码树失败，重试中...');
                    continue;
                }

                // 4.2 展开必要的节点
                const divisionExpanded = await expandDivision(page, 
                    code.startsWith('C') ? 'C 生命科学部' : 'H 医学科学部');
                if (!divisionExpanded) {
                    console.log('展开学部失败，重试中...');
                    continue;
                }
                await randomSleep(200, 300);

                const mainExpanded = await expandMainCategory(page, code.slice(0, 3));
                if (!mainExpanded) {
                    console.log('展开主类失败，重试中...');
                    continue;
                }
                await randomSleep(200, 300);

                // 4.3 选择具体代码
                codeSelected = await selectCode(page, code);
                if (!codeSelected) {
                    console.log('代码选择失败，准备重试...');
                    await randomSleep(500, 1000);
                }
            }

            if (!codeSelected) {
                throw new Error('代码选择失败，已达到最大重试次数');
            }

            // 5. 点击搜索并等待结果
            const searchResult = await clickSearchAndWait(page);
            if (!searchResult.hasResults) {
                return { results: [], count: 0 };
            }

            // 6. 处理搜索结果
            const { results: pageResults, count } = await processSearchResults(page, { year, fundType, code });
            
            // 7. 保存数据
            if (pageResults && pageResults.length > 0) {
                await saveToFile(pageResults, year, code);
            }

            return { results: pageResults, count };

        } catch (error) {
            console.error(`第 ${attempt} 次尝试失败:`, error);
            if (attempt === maxRetries) {
                throw error;
            }
            await sleep(3000 * attempt);
        }
    }

    return {
        results: results,
        count: results.length
    };
}

// 添加新的年份处理函数
async function runSearchByYear(page, year, options) {
    const { onProxyError } = options;
    const tracker = new ProgressTracker(year);
    await tracker.load();

    console.log(`[${year}] 开始处理年份数据`);

    // 加载子类代码配置
    const subCodesMap = await tracker.loadSubCodes();

    // 首次打开页面
    await page.setUserAgent(generateRandomUA());
    await page.goto('https://kd.nsfc.cn/finalProjectInit?advanced=true', {
        waitUntil: 'networkidle2',
        timeout: 30000
    });

    // 等待高级搜索面板加载完成
    await page.waitForFunction(() => {
        const panel = document.querySelector('.el-collapse-item.is-active');
        if (!panel) return false;
        const form = panel.querySelector('.el-form');
        return form && form.children.length > 0;
    }, { timeout: 15000 });

    for (const [mainCode, { mainName, subCodes }] of subCodesMap) {
        if (mainCode === 'C03') {
            console.log('C03 子代码列表:', subCodes.map(sc => sc.code));
            console.log('最后处理的子代码:', tracker.progress.lastSubCode);
        }
        // 如果有 lastSubCode，检查是否应该开始处理
        if (tracker.progress.lastSubCode) {
            const lastSubCode = tracker.progress.lastSubCode;
            
            // 如果所有当前子代码都小于最后处理的子代码，跳过这个主类
            if (subCodes.every(sc => sc.code < lastSubCode)) {
                console.log(`跳过已处理的主类 ${mainCode} (${mainName})...`);
                continue;
            }
        }

        console.log(`\n开始处理主类 ${mainCode} (${mainName})...`);

        for (const { code: subCode, name: subName } of subCodes) {
            // 如果当前子代码小于最后处理的子代码，跳过
            if (tracker.progress.lastSubCode && subCode < tracker.progress.lastSubCode) {
                console.log(`[${year}] 跳过已处理的子代码 ${subCode} (${subName})`);
                continue;
            }

            console.log(`\n处理子类 ${subCode} (${subName})...`);
            let totalCount = 0;

            for (const fundType of FUND_TYPES) {
                // 对于最后处理的子代码，检查基金类型
                if (subCode === tracker.progress.lastSubCode) {
                    const lastFundTypeIndex = FUND_TYPES.indexOf(tracker.progress.lastFundType);
                    const currentFundTypeIndex = FUND_TYPES.indexOf(fundType);
                    
                    if (currentFundTypeIndex <= lastFundTypeIndex) {
                        console.log(`[${year}] 跳过已处理的基金类型: ${subCode}-${fundType}`);
                        continue;
                    }
                }

                // 检查这个组合是否已完成
                if (tracker.isCompleted(subCode, fundType)) {
                    console.log(`[${year}] 跳过已完成的组合: ${subCode}-${fundType}`);
                    continue;
                }

                try {
                    console.log(`[${year}] 处理 ${fundType}-${subCode}`);
                    const { results, count } = await runSearch(page, {
                        year,
                        fundType,
                        code: subCode
                    });

                    await tracker.markAsCompleted(subCode, fundType, count);
                    totalCount += count;

                    // 搜索完成后刷新页面（除非是最后一次搜索）
                    const isLastSearch = mainCode === Array.from(subCodesMap.keys()).pop() &&
                        subCode === subCodes[subCodes.length - 1].code &&
                        fundType === FUND_TYPES[FUND_TYPES.length - 1];

                    if (!isLastSearch) {
                        await page.setUserAgent(generateRandomUA());
                        await page.goto('https://kd.nsfc.cn/finalProjectInit?advanced=true', {
                            waitUntil: 'networkidle2',
                            timeout: 30000
                        });
                    }

                    await randomSleep(1000, 2000);
                } catch (error) {
                    console.error(`[${year}] ${fundType}-${subCode} 处理失败:`, error);
                    // 添加错误记录
                    await tracker.markError(subCode, fundType);
                    
                    if (error.message.includes('net::') || error.message.includes('proxy')) {
                        if (onProxyError) {
                            page = await onProxyError();
                            await sleep(5000);
                        }
                    }
                }
            }

            // 标记子代码完成并记录总数
            await tracker.markSubCodeDone(mainCode, subCode, totalCount);
        }
    }
}

async function waitForPageLoad(page, timeout = 30000) {
    try {
        // 1. 等待加载遮罩消失
        await page.waitForFunction(() => {
            const masks = document.querySelectorAll('.el-loading-mask');
            return Array.from(masks).every(mask =>
                mask.style.display === 'none' || getComputedStyle(mask).display === 'none'
            );
        }, { timeout: timeout });

        // 2. 等待结果加载完成
        await page.waitForFunction(() => {
            // 检查是否有结果列表或无结果提示
            const resultList = document.querySelector('.info-warp:not(.searchNull)');
            const noResultDiv = document.querySelector('.info-warp.searchNull');
            return resultList || noResultDiv;
        }, { timeout: timeout });

        // 3. 检查是否有结果
        const hasNoResults = await page.evaluate(() => {
            const noResultDiv = document.querySelector('.info-warp.searchNull');
            return !!noResultDiv;
        });

        if (hasNoResults) {
            console.log('搜索无结果');
            return { hasResults: false, totalItems: 0 };
        }

        // 4. 获取结果总数
        const totalItems = await page.evaluate(() => {
            const totalSpan = document.querySelector('span[style="font-size: 16px;"]');
            if (!totalSpan) return 0;
            const totalText = totalSpan.textContent.match(/\d+/)?.[0];
            return totalText ? parseInt(totalText) : 0;
        });

        if (totalItems > 0) {
            console.log(`搜索成功：找到 ${totalItems} 条结果`);
            return { hasResults: true, totalItems };
        } else {
            console.log('搜索结果为空');
            return { hasResults: false, totalItems: 0 };
        }

    } catch (error) {
        console.error('等待页面加载超时:', error.message);
        throw error;
    }
}

// 修改 setupPage 函数
async function setupPage(browser) {
    const page = await browser.newPage();
    
    // 使用随机 User Agent
    await page.setUserAgent(generateRandomUA());
    
    // 设置请求拦截
    await page.setRequestInterception(true);
    page.on('request', request => {
        if (request.resourceType() === 'image') {
            request.abort();
        } else {
            request.continue();
        }
    });
    
    return page;
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

    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--window-size=1920x1080',
            '--disable-extensions',
            '--disable-default-apps',
            '--disable-notifications',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-breakpad',
            '--disable-component-extensions-with-background-pages',
            '--disable-features=TranslateUI,BlinkGenPropertyTrees',
            '--disable-ipc-flooding-protection',
            '--disable-renderer-backgrounding',
        ]
    });
    
    let page = await setupPage(browser);

    try {
        await runSearchByYear(page, year, {
            onProxyError: async () => {
                console.log('检测到代理错误，重新创建页面...');
                await page.close();
                return await setupPage(browser);
            }
        });
    } catch (error) {
        console.error('爬取过程中出现错误:', error);
    } finally {
        await browser.close();
    }
}

// 导出部分
module.exports = {
    runSearch,
    runSearchByYear
};

// 如果直接运行此文件
if (require.main === module) {
    main().catch(console.error);
}
