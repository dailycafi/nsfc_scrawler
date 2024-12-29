const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { runSearchByYear } = require('./scraper');
const { sleep, randomSleep } = require('./utils');
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

        // 添加代理状态追踪
        this.proxyStatus = new Map(); // 追踪每个代理的状态
        this.failedAttempts = new Map(); // 追踪失败次数
    }

    getRandomPort() {
        return Math.floor(Math.random() * (this.maxPort - this.minPort + 1)) + this.minPort;
    }

    async getProxyUrl(retryCount = 0) {
        const port = this.getRandomPort();
        const endpoint = `${this.baseEndpoint}:${port}`;
        
        // 检查这个代理是否已经失败过多次
        if (this.failedAttempts.get(endpoint) >= 3) {
            console.log(`代理 ${endpoint} 失败次数过多，尝试新的代理...`);
            return this.getProxyUrl(retryCount);
        }

        const originalProxyUrl = `http://${this.customer}:${this.password}@${endpoint}`;
        console.log('尝试使用代理:', endpoint);
        
        try {
            const anonymizedProxy = await proxyChain.anonymizeProxy(originalProxyUrl);
            this.proxyStatus.set(endpoint, 'active');
            return {
                proxyUrl: anonymizedProxy,
                endpoint,
                headers: {
                    'x-oxylabs-user-agent-type': 'desktop_chrome',
                    'x-oxylabs-geo-location': 'China'
                }
            };
        } catch (error) {
            // 记录失败次数
            this.failedAttempts.set(endpoint, (this.failedAttempts.get(endpoint) || 0) + 1);
            
            if (retryCount < this.maxRetries) {
                console.log(`代理 ${endpoint} 设置失败，尝试新的代理...`);
                await sleep(1000 * (retryCount + 1));
                return this.getProxyUrl(retryCount + 1);
            }
            throw error;
        }
    }

    async markProxyAsFailed(endpoint) {
        this.proxyStatus.set(endpoint, 'failed');
        this.failedAttempts.set(endpoint, (this.failedAttempts.get(endpoint) || 0) + 1);
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

async function closeBrowser(browser, proxyUrl) {
    await browser.close();
    await proxyChain.closeAnonymizedProxy(proxyUrl, true);
}

async function runScraperForYear(year, proxyManager) {
    let browser = null;
    let page = null;
    let proxyUrl = null;
    let endpoint = null;
    let retryCount = 0;
    const maxRetries = 10;

    while (retryCount < maxRetries) {
        try {
            if (!browser || !page) {
                const proxyInfo = await proxyManager.getProxyUrl();
                proxyUrl = proxyInfo.proxyUrl;
                endpoint = proxyInfo.endpoint;
                
                browser = await createBrowser(proxyUrl);
                page = await createPage(browser);
                await page.setExtraHTTPHeaders(proxyInfo.headers);

                // 设置更长的超时时间
                await page.setDefaultNavigationTimeout(60000);
                await page.setDefaultTimeout(60000);

                // 修改重定向检测的处理方式
                let redirected = false;
                page.on('framenavigated', frame => {
                    const url = frame.url();
                    if (url === 'https://kd.nsfc.cn/') {
                        console.log(`[${year}] 检测到重定向到首页，准备切换代理重试...`);
                        frame.page().evaluate(() => window.stop());
                        redirected = true;
                    }
                });

                const isValid = await proxyManager.validateProxy(page);
                if (!isValid) {
                    await proxyManager.markProxyAsFailed(endpoint);
                    throw new Error('代理验证失败');
                }
            }

            // 执行搜索
            await runSearchByYear(page, year, {
                onProxyError: async () => {
                    console.log(`[${year}] 代理出错，切换新代理...`);
                    await proxyManager.markProxyAsFailed(endpoint);
                    await closeBrowser(browser, proxyUrl);
                    
                    const proxyInfo = await proxyManager.getProxyUrl();
                    proxyUrl = proxyInfo.proxyUrl;
                    endpoint = proxyInfo.endpoint;
                    
                    browser = await createBrowser(proxyUrl);
                    page = await createPage(browser);
                    await page.setExtraHTTPHeaders(proxyInfo.headers);
                    await page.setDefaultNavigationTimeout(60000);
                    await page.setDefaultTimeout(60000);
                    
                    return page;
                },
                checkRedirect: () => redirected  // 添加重定向检查
            });

            if (redirected) {
                throw new Error('页面重定向到首页');
            }

            // 如果执行到这里，说明成功了，重置重试计数
            retryCount = 0;
            console.log(`[${year}] 完成数据处理`);
            await closeBrowser(browser, proxyUrl);
            return;

        } catch (error) {
            console.error(`[${year}] 尝试 ${retryCount + 1}/${maxRetries} 失败:`, error);
            
            if (browser) {
                await closeBrowser(browser, proxyUrl);
                browser = null;
                page = null;
            }
            
            retryCount++;
            const waitTime = error.name === 'TimeoutError' || error.message === '页面重定向到首页'
                ? 10000 * retryCount  // 超时或重定向错误等待较短时间
                : 30000 * retryCount; // 其他错误等待较长时间
            
            console.log(`[${year}] 等待 ${waitTime/1000} 秒后重试...`);
            await sleep(waitTime);
        }
    }
    
    throw new Error(`[${year}] 达到最大重试次数`);
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
                console.log('批次处理完成，等待5到10秒后继续...');
                await randomSleep(5000, 10000);
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
        // headless: "new",
        headless: false,
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
        timeout: 60000
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