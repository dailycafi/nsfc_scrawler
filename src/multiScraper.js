const { runSearch } = require('./scraper');
const puppeteer = require('puppeteer');
const OxylabsManager = require('./proxy/OxylabsManager');
const oxyConfig = require('./config/oxylabs');
const prompt = require('prompt-sync')({ sigint: true });

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


// 添加 sleep 函数
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 添加用户输入函数
async function askQuestion(query) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false
        });

        rl.question(query, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

async function initBrowser(proxyManager) {
    const { proxyUrl } = proxyManager.getProxyUrl();
    console.log('正在使用代理:', proxyUrl);

    try {
        const browser = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--ignore-certificate-errors',
                '--ignore-certificate-errors-spki-list',
                `--proxy-server=${proxyUrl}`,
                '--disable-web-security',
                '--allow-running-insecure-content',
                '--disable-features=IsolateOrigins,site-per-process',
            ],
            ignoreHTTPSErrors: true
        });

        const page = await browser.newPage();
        
        await page.authenticate({
            username: `customer-${oxyConfig.username}`,
            password: oxyConfig.password
        });

        page.setDefaultTimeout(30000);
        page.setDefaultNavigationTimeout(30000);

        page.on('error', err => {
            console.error('页面错误:', err);
        });

        return { browser, page };
    } catch (err) {
        console.error('初始化浏览器失败:', err);
        throw err;
    }
}

async function testProxy(page) {
    try {
        console.log('测试代理连接...');
        const response = await page.goto('http://ip.oxylabs.io/location', {
            waitUntil: 'networkidle0',
            timeout: 30000
        });
        
        const content = await response.text();
        console.log('代理测试结果:', content);
        return true;
    } catch (err) {
        console.error('代理测试失败:', err);
        return false;
    }
}

async function runScraperForYear(year, proxyManager) {
    console.log(`[${new Date().toISOString()}] 开始处理 ${year} 年的数据`);
    
    try {
        const { browser, page } = await initBrowser(proxyManager);
        
        // 先测试代理
        const proxyWorking = await testProxy(page);
        if (!proxyWorking) {
            throw new Error('代理连接测试失败');
        }

        for (const fundType of FUND_TYPES) {
            for (const code of CODES) {
                if (BLACKLIST_CODES.includes(code)) {
                    continue;
                }
                
                try {
                    await runSearch(page, { year, fundType, code });
                    await sleep(proxyManager.getRandomDelay());
                } catch (err) {
                    console.error(`处理 ${year}-${fundType}-${code} 时出错:`, err.message);
                }
            }
        }

        await browser.close();
        console.log(`[${new Date().toISOString()}] 完成 ${year} 年的数据处理`);
    } catch (err) {
        console.error(`处理 ${year} 年数据时发生错误:`, err);
    }
}

async function runMultiYearScraper(startYear, endYear, maxConcurrent = 3) {
    const years = Array.from(
        { length: endYear - startYear + 1 }, 
        (_, i) => startYear + i
    );
    
    const proxyManagers = Array.from(
        { length: maxConcurrent }, 
        () => new OxylabsManager(oxyConfig)
    );

    for (let i = 0; i < years.length; i += maxConcurrent) {
        const yearBatch = years.slice(i, i + maxConcurrent);
        const promises = yearBatch.map((year, index) => 
            runScraperForYear(year, proxyManagers[index])
        );

        await Promise.all(promises);
        
        if (i + maxConcurrent < years.length) {
            console.log('次处理完成，等待30秒后继续...');
            await sleep(30000);
        }
    }
}

// 修改用户输入函数
async function getInputs() {
    try {
        // 使用同步提示输入
        const startYear = parseInt(prompt('请输入起始年份 (例如: 2010): '));
        if (isNaN(startYear)) {
            throw new Error('起始年份必须是有效的数字');
        }

        const endYear = parseInt(prompt('请输入结束年份 (例如: 2022): '));
        if (isNaN(endYear)) {
            throw new Error('结束年份必须是有效的数字');
        }

        const maxConcurrent = parseInt(prompt('请输入同时运行的爬虫数量 (建议 2-5 个): '));
        if (isNaN(maxConcurrent)) {
            throw new Error('爬虫数量必须是有效的数字');
        }

        // 验证输入
        if (startYear > endYear) {
            throw new Error('起始年份必须小于或等于结束年份');
        }

        if (maxConcurrent < 1 || maxConcurrent > 10) {
            throw new Error('爬虫数量必须在 1-10 之间');
        }

        return { startYear, endYear, maxConcurrent };
    } catch (error) {
        console.error('输入错误:', error.message);
        process.exit(1);
    }
}

// 修改主函数
async function main() {
    try {
        console.log('多年份数据爬取程序');
        
        // 获取所有输入
        const { startYear, endYear, maxConcurrent } = await getInputs();

        console.log(`\n开始爬取 ${startYear}-${endYear} 年的数据，同时运行 ${maxConcurrent} 个爬虫\n`);
        
        await runMultiYearScraper(startYear, endYear, maxConcurrent);
        console.log('所有年份处理完成！');
        
    } catch (error) {
        console.error('程序执行出错:', error.message);
    }
}

// 运行程序
main().catch(console.error); 