const { runSearch, runSearchByYear, ProgressTracker } = require('./scraper');
const puppeteer = require('puppeteer');
const prompt = require('prompt-sync')({ sigint: true });
const proxyChain = require('proxy-chain');

class ProxyManager {
    constructor(config) {
        this.username = config.username;
        this.password = config.password;
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
    }

    getRandomPort() {
        return Math.floor(Math.random() * (this.maxPort - this.minPort + 1)) + this.minPort;
    }

    async getProxyUrl(retryCount = 0) {
        const now = Date.now();
        if (now - this.lastRotationTime >= this.rotationInterval) {
            console.log(`[${new Date().toISOString()}] 定时更新IP触发检查`);
            this.rotateEndpoint();
            this.lastRotationTime = now;
            console.log(`上次更新时间: ${new Date(this.lastRotationTime).toISOString()}`);
        }

        this.requestCount++;
        if (this.requestCount >= this.maxRequestsPerIP) {
            this.rotateEndpoint();
            this.requestCount = 0;
        }

        const port = this.getRandomPort();
        const endpoint = `${this.baseEndpoint}:${port}`;
        const originalProxyUrl = `http://${this.username}:${this.password}@${endpoint}`;

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
            if (retryCount >= this.maxRetries) {
                throw new Error(`代理获取失败，已重试${this.maxRetries}次: ${error.message}`);
            }
            console.error(`代理获取失败，尝试第${retryCount + 1}次重试:`, error);
            return this.getProxyUrl(retryCount + 1);
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
                console.log('新IP验证失败，尝试重新更新...');
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
        const browser = await puppeteer.launch({
            headless: 'new', // 使用新的 headless 模式
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--ignore-certificate-errors',
                `--proxy-server=${proxyUrl}`
            ],
            ignoreHTTPSErrors: true
        });

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
    console.log(`[${year}] 开始处理数据`);
    let browser, page, proxyUrl;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
        try {
            // 初始化浏览器
            ({ browser, page, proxyUrl } = await initBrowser(proxyManager, year));
            
            // 传入 proxyManager 以便在需要时切换代理
            await runSearchByYear(page, year, {
                onProxyError: async () => {
                    // 关闭当前浏览器
                    await closeBrowser(browser, proxyUrl);
                    
                    // 切换代理并重新初始化浏览器
                    console.log(`[${year}] 切换代理并重新初始化浏览器...`);
                    proxyManager.rotateEndpoint();
                    ({ browser, page, proxyUrl } = await initBrowser(proxyManager, year));
                    
                    return page;
                }
            });
            
            await closeBrowser(browser, proxyUrl);
            console.log(`[${year}] 完成数据处理`);
            return;
            
        } catch (error) {
            console.error(`[${year}] 尝试 ${retryCount + 1}/${maxRetries} 失败:`, error);
            if (browser) await closeBrowser(browser, proxyUrl);
            retryCount++;
            
            if (retryCount < maxRetries) {
                console.log(`[${year}] 等待30秒后重试...`);
                await new Promise(resolve => setTimeout(resolve, 30000));
            }
        }
    }
    
    throw new Error(`[${year}] 达到最大重试次数，放弃处理`);
}

async function runMultiYearScraper(startYear, endYear, maxConcurrent = 3) {
    const years = Array.from(
        { length: endYear - startYear + 1 }, 
        (_, i) => startYear + i
    );
    
    const proxyManagers = Array.from(
        { length: maxConcurrent }, 
        () => new ProxyManager({
            username: 'dailycafi_OeqdP',
            password: 'Cinbofei3loushab_'
        })
    );

    try {
        for (let i = 0; i < years.length; i += maxConcurrent) {
            const yearBatch = years.slice(i, i + maxConcurrent);
            const promises = yearBatch.map((year, index) => 
                runScraperForYear(year, proxyManagers[index])
            );

            await Promise.all(promises);
            
            if (i + maxConcurrent < years.length) {
                console.log('批次处理完成，等待30秒后继续...');
                await sleep(30000);
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

        // 自动计算需要的爬虫数量
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

main().catch(console.error); 