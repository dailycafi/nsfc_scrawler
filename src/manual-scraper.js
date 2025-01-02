/**
 * manual-scraper.js
 * 手动选择年份的爬虫程序，自动使用对应的固定代理
 */

const puppeteer = require('puppeteer');
const { runSearchByYear } = require('./scraper');
const fs = require('fs').promises;
const path = require('path');
const { YEAR_PROXY_MAP, PROXY_AUTH } = require('./config');

// 年份列表（从配置中获取）
const YEARS = Object.keys(YEAR_PROXY_MAP).map(Number).sort();

// 记录文件路径
const PROGRESS_FILE = path.join(__dirname, 'scraping-progress.json');

async function loadProgress() {
    try {
        const data = await fs.readFile(PROGRESS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return { completed: [] };
    }
}

async function saveProgress(progress) {
    await fs.writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function scrapeWithProxy(year) {
    const proxy = YEAR_PROXY_MAP[year];
    console.log(`\n开始处理 ${year} 年数据，使用固定代理: ${proxy.ip}:${proxy.port}`);
    console.log(`代理位置: ${proxy.location} (${proxy.isp})`);
    
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            `--proxy-server=${proxy.ip}:${proxy.port}`,
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--window-size=1920x1080'
        ]
    });

    try {
        let page = await browser.newPage();
        await page.authenticate(PROXY_AUTH);
        
        page.setDefaultTimeout(60000);
        page.setDefaultNavigationTimeout(60000);

        await runSearchByYear(page, year, {
            onProxyError: async () => {
                console.log('检测到代理错误，重新创建页面...');
                await page.close();
                page = await browser.newPage();
                await page.authenticate(PROXY_AUTH);
                page.setDefaultTimeout(60000);
                page.setDefaultNavigationTimeout(60000);
                return page;
            }
        });

        console.log(`✓ ${year}年数据处理完成`);
        return true;
    } catch (error) {
        console.error(`✗ ${year}年数据处理失败:`, error.message);
        return false;
    } finally {
        await browser.close();
    }
}

async function main() {
    // 加载进度
    const progress = await loadProgress();
    
    // 显示当前进度
    console.log('\n当前进度:');
    console.log('已完成年份:', progress.completed.join(', ') || '无');
    console.log('剩余年份:', YEARS.filter(y => !progress.completed.includes(y)).join(', '));
    
    // 显示年份和代理的对应关系
    console.log('\n年份与固定代理的对应关系:');
    for (const year of YEARS) {
        const proxy = YEAR_PROXY_MAP[year];
        const status = progress.completed.includes(year) ? '[已完成]' : '[待处理]';
        console.log(`${year}年 ${status} => ${proxy.location} (${proxy.isp})`);
    }

    // 获取用户输入
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const remainingYears = YEARS.filter(y => !progress.completed.includes(y));
    if (remainingYears.length === 0) {
        console.log('所有年份都已处理完成！');
        process.exit(0);
    }

    console.log('\n可选年份:');
    remainingYears.forEach((year, index) => {
        const proxy = YEAR_PROXY_MAP[year];
        console.log(`${index + 1}. ${year} => ${proxy.location} (${proxy.isp})`);
    });

    const yearIndex = await new Promise(resolve => {
        readline.question('\n请选择要处理的年份 (输入序号): ', answer => {
            readline.close();
            resolve(parseInt(answer) - 1);
        });
    });

    const selectedYear = remainingYears[yearIndex];
    if (!selectedYear) {
        console.error('无效的年份选择！');
        process.exit(1);
    }

    // 执行爬虫
    const success = await scrapeWithProxy(selectedYear);
    
    // 更新进度
    if (success) {
        progress.completed.push(selectedYear);
        await saveProgress(progress);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    scrapeWithProxy
}; 