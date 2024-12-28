const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { runSearchByYear } = require('./scraper');
const puppeteer = require('puppeteer');
const prompt = require('prompt-sync')({ sigint: true });
const proxyChain = require('proxy-chain');

async function validateProxy(page) {
    try {
        await page.goto('http://ip.oxylabs.io', {
            waitUntil: 'networkidle0',
            timeout: 30000
        });
        const ip = await page.evaluate(() => document.body.innerText);
        console.log(`代理验证成功，当前IP: ${ip}`);
        return true;
    } catch (error) {
        console.error('代理验证失败:', error);
        return false;
    }
}

class ProxyManager {
    constructor() {
        if (!process.env.PROXY_CUSTOMER || !process.env.PROXY_PASSWORD) {
            throw new Error('代理配置未找到，请检查 .env 文件');
        }
        
        this.customer = process.env.PROXY_CUSTOMER;
        this.password = process.env.PROXY_PASSWORD;
        console.log('代理配置:', {
            customer: this.customer,
            password: this.password.substring(0, 1) + '****'  // 只显示部分密码
        });
        
        this.baseEndpoint = 'cn-pr.oxylabs.io';
        this.minPort = 30001;
        this.maxPort = 39999;
        this.currentEndpointIndex = 0;
        this.requestCount = 0;
        this.maxRequestsPerIP = 50;
        this.minDelay = 1000;
        this.maxDelay = 3000;
        this.lastRotationTime = Date.now();
        this.rotationInterval = 10 * 60 * 1000; // 10分钟
        this.maxRetries = 3;
        
        // 添加定时器
        this.rotationTimer = setInterval(() => {
            this.forceRotateEndpoint();
        }, this.rotationInterval);

        this.validateProxy = validateProxy;
    }

    getRandomPort() {
        return Math.floor(Math.random() * (this.maxPort - this.minPort + 1)) + this.minPort;
    }

    async getProxyUrl(retryCount = 0) {
        const port = this.getRandomPort();
        const endpoint = `${this.baseEndpoint}:${port}`;
        const originalProxyUrl = `http://${this.customer}:${this.password}@${endpoint}`;
        console.log('尝试使用代理:', endpoint);
        
        try {
            const anonymizedProxy = await proxyChain.anonymizeProxy(originalProxyUrl);
            return {
                proxyUrl: anonymizedProxy,
                headers: {
                    'x-oxylabs-user-agent-type': 'desktop_chrome',
                    'x-oxylabs-geo-location': 'China'
                }
            };
        } catch (error) {
            console.error('代理设置失败:', error);
            if (retryCount < 3) {
                return this.getProxyUrl(retryCount + 1);
            }
            throw error;
        }
    }

    rotateEndpoint() {
        console.log(`[${new Date().toISOString()}] 轮换到新代理`);
        this.requestCount = 0;
        this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.maxPort;
        return this.getRandomPort();
    }

    getRandomDelay() {
        return Math.floor(Math.random() * (this.maxDelay - this.minDelay + 1)) + this.minDelay;
    }

    async validateProxy(page) {
        try {
            await page.goto('http://ip.oxylabs.io', {
                waitUntil: 'networkidle0',
                timeout: 30000
            });
            const ip = await page.evaluate(() => document.body.innerText);
            console.log(`代理验证成功，当前IP: ${ip}`);
            return true;
        } catch (error) {
            console.error('代理验证失败:', error);
            return false;
        }
    }

    // 添加新方法来强制更新IP
    async forceRotateEndpoint() {
        console.log(`[${new Date().toISOString()}] 定时强制更新IP...`);
        this.rotateEndpoint();
        this.lastRotationTime = Date.now();
        
        // 验证新IP
        try {
            const { proxyUrl, headers } = await this.getProxyUrl();
            const browser = await puppeteer.launch({
                headless: 'new',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--ignore-certificate-errors',
                    `--proxy-server=${proxyUrl}`
                ]
            });
            const page = await browser.newPage();
            await page.setExtraHTTPHeaders(headers);
            
            const isValid = await this.validateProxy(page);
            if (!isValid) {
                console.log('IP验证失败，尝试重新更新...');
                await this.forceRotateEndpoint();
            }
            
            await browser.close();
            await proxyChain.closeAnonymizedProxy(proxyUrl, true);
        } catch (error) {
            console.error('IP更新验证失败:', error);
            // 如果失败，稍后重试
            setTimeout(() => this.forceRotateEndpoint(), 30000);
        }
    }

    // 添加清理方法
    cleanup() {
        if (this.rotationTimer) {
            clearInterval(this.rotationTimer);
        }
    }
}

async function initBrowser(proxyManager, year, retryCount = 0) {
    const maxRetries = 3;
    const { proxyUrl, headers } = await proxyManager.getProxyUrl();
    console.log(`[${year}] 正在使用匿名代理:`, proxyUrl);

    try {
        const browser = await createBrowser(proxyUrl);
        const page = await browser.newPage();
        await page.setExtraHTTPHeaders(headers);

        // 验证代理是否可用
        const isValid = await proxyManager.validateProxy(page);
        if (!isValid) {
            await closeBrowser(browser, proxyUrl);
            if (retryCount >= maxRetries) {
                throw new Error('代理验证失败次数过多');
            }
            console.log(`[${year}] 代理验证失败，尝试新的代理...`);
            return initBrowser(proxyManager, year, retryCount + 1);
        }

        return { browser, page, proxyUrl };
    } catch (err) {
        console.error(`[${year}] 初始化浏览器失败:`, err);
        if (retryCount >= maxRetries) {
            throw err;
        }
        return initBrowser(proxyManager, year, retryCount + 1);
    }
}

async function closeBrowser(browser, proxyUrl) {
    await browser.close();
    await proxyChain.closeAnonymizedProxy(proxyUrl, true);
}

async function runScraperForYear(year, proxyManager) {
    let browser = null;
    let page = null;
    let proxyUrl = null;
    let retryCount = 0;
    const maxRetries = 10;

    while (retryCount < maxRetries) {
        try {
            if (!browser || !page) {
                // 使用 initBrowser 替代直接创建浏览器
                const browserInfo = await initBrowser(proxyManager, year);
                browser = browserInfo.browser;
                page = browserInfo.page;
                proxyUrl = browserInfo.proxyUrl;
                console.log(`[${year}] 成功初始化浏览��实例`);
            }

            await runSearchByYear(page, year, {
                onProxyError: async () => {
                    // 当发生代理错误时
                    console.log(`[${year}] 代理出错，切换新代理...`);
                    await closeBrowser(browser, proxyUrl);
                    
                    // 使用 initBrowser 获取新的浏览器实例
                    const browserInfo = await initBrowser(proxyManager, year);
                    browser = browserInfo.browser;
                    page = browserInfo.page;
                    proxyUrl = browserInfo.proxyUrl;
                    
                    return page;
                }
            });

            console.log(`[${year}] 完成数据处理`);
            await closeBrowser(browser, proxyUrl);
            return;

        } catch (error) {
            console.error(`[${year}] 尝试 ${retryCount + 1}/${maxRetries} 失败:`, error);
            
            if (browser) await closeBrowser(browser, proxyUrl);
            browser = null;
            page = null;
            
            retryCount++;
            
            if (retryCount < maxRetries) {
                console.log(`[${year}] 等待30秒后使用新代理重试...`);
                await new Promise(resolve => setTimeout(resolve, 30000));
            }
        }
    }
    
    console.error(`[${year}] 达到最大重试次数，但将继续尝试...`);
    return runScraperForYear(year, proxyManager);
}

async function runMultiYearScraper(startYear, endYear, maxConcurrent = 3) {
    const years = Array.from(
        { length: endYear - startYear + 1 }, 
        (_, i) => startYear + i
    );
    
    const proxyManagers = Array.from(
        { length: maxConcurrent }, 
        () => new ProxyManager()
    );

    try {
        for (let i = 0; i < years.length; i += maxConcurrent) {
            const yearBatch = years.slice(i, i + maxConcurrent);
            const promises = yearBatch.map((year, index) => 
                runScraperForYear(year, proxyManagers[index])
            );

            await Promise.all(promises);
            
            if (i + maxConcurrent < years.length) {
                console.log('批次处理完成，等待10秒后继续...');
                await sleep(10000);
            }
        }
        
        console.log(`所有年份 (${startYear}-${endYear}) 处理完成！`);
    } finally {
        proxyManagers.forEach(manager => manager.cleanup());
    }
}

async function getInputs() {
    try {
        const startYear = parseInt(prompt('请输入起始年份 (例如: 2005): '));
        if (isNaN(startYear)) {
            throw new Error('起始年份必须是有效的数字');
        }

        const endYear = parseInt(prompt('请输入结束年份 (例如: 2015): '));
        if (isNaN(endYear)) {
            throw new Error('结束年份必须是有效的数字');
        }

        if (startYear > endYear) {
            throw new Error('起始年份必须小于或等于结束年份');
        }

        // 动计算需要的爬虫数量
        const maxConcurrent = endYear - startYear + 1;
        console.log(`根据年份范围，将使用 ${maxConcurrent} 个并发爬虫`);

        return { startYear, endYear, maxConcurrent };
    } catch (error) {
        console.error('输入错误:', error.message);
        process.exit(1);
    }
}

async function main() {
    try {
        console.log('多年份数据爬取程序');
        
        const { startYear, endYear, maxConcurrent } = await getInputs();

        console.log(`\n开始爬取 ${startYear}-${endYear} 年的数据，同时运行 ${maxConcurrent} 个爬虫\n`);
        
        await runMultiYearScraper(startYear, endYear, maxConcurrent);
        console.log('所有年份处理完成！');
        
    } catch (error) {
        console.error('程序执行出错:', error.message);
    }
}

// 添加这些辅助函数
async function createBrowser(proxyUrl) {
    console.log('启动浏览器，使用代理:', proxyUrl);
    
    return await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--ignore-certificate-errors',
            `--proxy-server=${proxyUrl}`,
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
            '--disable-site-isolation-trials',
            '--enable-features=NetworkService,NetworkServiceInProcess',
            '--force-color-profile=srgb',
            '--metrics-recording-only',
            '--no-first-run',
        ],
        ignoreHTTPSErrors: true,
        timeout: 30000
    });
}

async function createPage(browser) {
    const page = await browser.newPage();
    
    // 设置请求拦截
    await page.setRequestInterception(true);
    page.on('request', request => {
        if (request.resourceType() === 'image' || 
            request.resourceType() === 'stylesheet' || 
            request.resourceType() === 'font') {
            request.abort();
        } else {
            request.continue();
        }
    });

    return page;
}

main().catch(console.error); 