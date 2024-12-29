const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { runSearchByYear } = require('./scraper');
const { sleep, randomSleep } = require('./utils');
const puppeteer = require('puppeteer');
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
        this.proxyPerformance = new Map(); // 追踪代理性能
    }

    getRandomPort() {
        return Math.floor(Math.random() * (this.maxPort - this.minPort + 1)) + this.minPort;
    }

    async getProxyUrl(retryCount = 0) {
        try {
            const port = this.getRandomPort();
            const endpoint = `${this.baseEndpoint}:${port}`;
            const originalProxyUrl = `http://customer-${this.customer}:${this.password}@${endpoint}`;
            
            console.log('\n=== 代理信息 ===');
            console.log(`使用的代理: ${endpoint}`);
            console.log('================\n');
            
            const anonymizedProxy = await proxyChain.anonymizeProxy(originalProxyUrl);
            console.log('匿名代理URL:', anonymizedProxy);
            
            return {
                proxyUrl: anonymizedProxy,
                endpoint: endpoint,
                headers: {
                    'x-oxylabs-user-agent-type': 'desktop_chrome',
                    'x-oxylabs-geo-location': 'China'
                }
            };
        } catch (error) {
            console.error('代理设置失败:', error);
            if (retryCount < this.maxRetries) {
                console.log(`尝试新的代理... (${retryCount + 1}/${this.maxRetries})`);
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

    async trackProxyPerformance(endpoint, startTime) {
        const responseTime = Date.now() - startTime;
        this.proxyPerformance.set(endpoint, responseTime);
        
        // 如果响应时间过长，标记为较差的代理
        if (responseTime > 10000) { // 超过10秒
            console.log(`代理 ${endpoint} 响应时间过长: ${responseTime}ms`);
            await this.markProxyAsFailed(endpoint);
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
    const targetUrl = 'https://kd.nsfc.cn/finalProjectInit?advanced=true';

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

                // 设置请求拦截
                await page.setRequestInterception(true);
                page.on('request', request => {
                    // 检查请求是否已经被处理
                    if (request.isInterceptResolutionHandled()) {
                        return;
                    }

                    const url = request.url();
                    try {
                        if (url === 'https://kd.nsfc.cn/') {
                            console.log(`[${year}] 拦截到重定向请求，继续加载原始页面...`);
                            request.abort();
                        } else if (request.resourceType() === 'image' || 
                                 request.resourceType() === 'stylesheet' || 
                                 request.resourceType() === 'font') {
                            request.abort();
                        } else {
                            request.continue();
                        }
                    } catch (error) {
                        // 如果请求已经被处理，忽略错误
                        if (!error.message.includes('Request is already handled')) {
                            console.error('请求处理错误:', error);
                        }
                    }
                });

                // 监控所有响应
                page.on('response', response => {
                    const status = response.status();
                    const url = response.url();
                    if (status >= 300 && status <= 399) {
                        console.log(`[${year}] 检测到重定向响应: ${status} -> ${url}`);
                    }
                });
            }

            console.log(`[${year}] 尝试访问页面...`);
            const response = await page.goto(targetUrl, {
                waitUntil: 'networkidle0',
                timeout: 60000
            });

            if (response.status() >= 300 && response.status() <= 399) {
                throw new Error('页面返回重定向状态码');
            }

            // 验证页面内容
            const pageUrl = page.url();
            if (pageUrl === 'https://kd.nsfc.cn/') {
                throw new Error('页面已被重定向到首页');
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
                    return page;
                }
            });

            // 如果执行到这里，说明成功了
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
            const waitTime = 10000 * retryCount;
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
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const question = (query) => new Promise((resolve) => {
        readline.question(query, (answer) => {
            resolve(answer);
        });
    });

    try {
        console.log('请输入起始年份 (例如: 2005)');
        const startYear = parseInt(await question('> '));
        if (isNaN(startYear)) {
            throw new Error('起始年份必须是有效的数字');
        }

        console.log('\n请输入结束年份 (例如: 2015)');
        const endYear = parseInt(await question('> '));
        if (isNaN(endYear)) {
            throw new Error('结束年份必须是有效的数字');
        }

        readline.close();

        if (startYear > endYear) {
            throw new Error('起始年份必须小于或等于结束年份');
        }

        const maxConcurrent = endYear - startYear + 1;
        console.log(`\n根据年份范围，将使用 ${maxConcurrent} 个并发爬虫`);

        return { startYear, endYear, maxConcurrent };
    } catch (error) {
        console.error('输入错误:', error.message);
        readline.close();
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
        headless: true,
        args: [
            `--proxy-server=${proxyUrl}`,
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--ignore-certificate-errors',
        ],
        ignoreHTTPSErrors: true
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