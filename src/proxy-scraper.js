const puppeteer = require('puppeteer');
const { runSearchByYear } = require('./scraper');
const https = require('https');

async function checkIP() {
    return new Promise((resolve, reject) => {
        // 使用 httpbin.org 的服务（支持 http/https）
        const options = {
            hostname: 'httpbin.org',
            path: '/ip',
            method: 'GET',
            timeout: 5000
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const ip = JSON.parse(data).origin;
                    console.log('当前本地 IP:', ip);
                    resolve(ip);
                } catch (e) {
                    reject(new Error('解析 IP 信息失败'));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.end();
    });
}

async function verifyProxy(page) {
    try {
        console.log('正在验证代理...');
        
        // 先获取本地 IP
        const localIP = await checkIP();
        
        // 然后获取浏览器中的 IP
        await page.goto('https://httpbin.org/ip', { timeout: 30000 });
        const browserIP = await page.evaluate(() => {
            return JSON.parse(document.body.textContent).origin;
        });
        
        console.log('浏览器中的 IP:', browserIP);
        
        // 比较两个 IP 是否不同
        if (localIP !== browserIP) {
            console.log('代理验证成功：本地IP和浏览器IP不同');
            return true;
        } else {
            console.log('警告：本地IP和浏览器IP相同，代理可能未生效');
            return false;
        }
    } catch (error) {
        console.error('代理验证失败:', error);
        return false;
    }
}

async function runScraperWithProxy(year) {
    const proxyServer = '36.25.243.5:11839';
    console.log(`使用代理 ${proxyServer} 开始爬虫...`);

    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            `--proxy-server=${proxyServer}`,
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--window-size=1920x1080'
        ]
    });

    try {
        let page = await browser.newPage();
        
        page.setDefaultTimeout(60000);
        page.setDefaultNavigationTimeout(60000);

        const proxyWorking = await verifyProxy(page);
        if (!proxyWorking) {
            throw new Error('代理未生效，当前可能在使用本地 IP！');
        }
        console.log('代理验证成功，确认使用代理 IP');

        await runSearchByYear(page, year, {
            onProxyError: async () => {
                console.log('检测到代理错误，重新创建页面...');
                await page.close();
                page = await browser.newPage();
                page.setDefaultTimeout(60000);
                page.setDefaultNavigationTimeout(60000);
                
                const proxyStillWorking = await verifyProxy(page);
                if (!proxyStillWorking) {
                    throw new Error('代理重连失败，当前可能在使用本地 IP！');
                }
                
                return page;
            }
        });

    } catch (error) {
        console.error('爬虫过程中出现错误:', error);
    } finally {
        await browser.close();
        console.log('\n爬虫完成');
    }
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

    await runScraperWithProxy(year);
}

// 运行爬虫
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    runScraperWithProxy
};
