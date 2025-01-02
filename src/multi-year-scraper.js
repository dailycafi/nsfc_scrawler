const puppeteer = require('puppeteer');
const { runSearchByYear } = require('./scraper');
const https = require('https');

// 代理配置列表
const PROXY_LIST = [
    { id: 'lrps-06368', ip: '36.25.243.5', port: '11842', location: '中山市', isp: '移动' },
    { id: 'lrps-06369', ip: '36.25.243.5', port: '10852', location: '济宁市', isp: '联通' },
    { id: 'lrps-06370', ip: '36.25.243.5', port: '11861', location: '邯郸市', isp: '联通' },
    { id: 'lrps-06371', ip: '36.25.243.5', port: '10853', location: '南昌市', isp: '电信' },
    { id: 'lrps-06372', ip: '36.25.243.5', port: '11865', location: '天津市', isp: '联通' },
    { id: 'lrps-06373', ip: '36.25.243.5', port: '11876', location: '运城市', isp: '联通' },
    { id: 'lrps-06374', ip: '36.25.243.5', port: '10854', location: '抚州市', isp: '电信' },
    { id: 'lrps-06375', ip: '36.25.243.5', port: '11885', location: '湛江市', isp: '移动' },
    { id: 'lrps-06376', ip: '36.25.243.5', port: '10855', location: '娄底市', isp: '电信' },
    { id: 'lrps-06377', ip: '36.25.243.5', port: '11889', location: '天津市', isp: '联通' }
];

const PROXY_AUTH = {
    username: 'qgpjclvx',
    password: 'npd7cjmz'
};

// 年份列表（排除2016和2020）
const YEARS = [2010, 2011, 2012, 2013, 2014, 2015, 2017, 2018, 2019];

async function checkIP() {
    return new Promise((resolve, reject) => {
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

async function verifyProxy(page, proxyInfo) {
    try {
        console.log('正在验证代理...');
        console.log(`代理服务器: ${proxyInfo.ip}:${proxyInfo.port}`);
        
        const localIP = await checkIP();
        
        await page.goto('https://httpbin.org/ip', { timeout: 30000 });
        const browserIP = await page.evaluate(() => {
            return JSON.parse(document.body.textContent).origin;
        });
        
        console.log('浏览器中的 IP:', browserIP);
        
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

async function scrapeWithProxy(year, proxyInfo) {
    console.log(`\n开始处理 ${year} 年数据，使用代理: ${proxyInfo.ip}:${proxyInfo.port}`);
    console.log(`实际IP: ${proxyInfo.actualIP}`);
    
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            `--proxy-server=${proxyInfo.ip}:${proxyInfo.port}`,
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--window-size=1920x1080'
        ],
        dumpio: true
    });

    try {
        let page = await browser.newPage();
        
        page.on('error', err => {
            console.error('页面错误:', err);
        });
        page.on('pageerror', err => {
            console.error('页面JS错误:', err);
        });
        page.on('console', msg => {
            console.log('页面控制台:', msg.text());
        });
        
        await page.authenticate(PROXY_AUTH);
        
        page.setDefaultTimeout(60000);
        page.setDefaultNavigationTimeout(60000);

        const proxyWorking = await verifyProxy(page, proxyInfo);
        if (!proxyWorking) {
            throw new Error('代理未生效，当前可能在使用本地 IP！');
        }

        await runSearchByYear(page, year, {
            onProxyError: async () => {
                console.log('检测到代理错误，重新创建页面...');
                await page.close();
                page = await browser.newPage();
                await page.authenticate(PROXY_AUTH);
                page.setDefaultTimeout(60000);
                page.setDefaultNavigationTimeout(60000);
                
                const proxyStillWorking = await verifyProxy(page, proxyInfo);
                if (!proxyStillWorking) {
                    throw new Error('代理重连失败，当前可能在使用本地 IP！');
                }
                
                return page;
            }
        });

    } catch (error) {
        console.error(`${year}年数据处理出错:`);
        console.error('错误类型:', error.name);
        console.error('错误信息:', error.message);
        console.error('错误堆栈:', error.stack);
        throw error;
    } finally {
        await browser.close();
    }
}

async function verifyAllProxies(proxies) {
    console.log('开始验证所有代理...\n');
    const proxyIPs = new Map(); // 用于存储代理IP映射
    const validProxies = []; // 存储有效且IP不重复的代理

    for (const proxy of proxies) {
        const browser = await puppeteer.launch({
            headless: "new",
            args: [
                `--proxy-server=${proxy.ip}:${proxy.port}`,
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
            ]
        });

        try {
            const page = await browser.newPage();
            await page.authenticate(PROXY_AUTH);
            
            console.log(`正在验证代理: ${proxy.ip}:${proxy.port}`);
            await page.goto('https://httpbin.org/ip', { timeout: 30000 });
            
            const ip = await page.evaluate(() => {
                return JSON.parse(document.body.textContent).origin;
            });

            console.log(`实际使用的IP: ${ip}`);
            
            // 如果这个IP还没被使用过，添加到有效代理列表
            if (!proxyIPs.has(ip)) {
                proxyIPs.set(ip, proxy);
                validProxies.push({
                    ip: proxy.ip,
                    port: proxy.port,
                    actualIP: ip
                });
                console.log(`✓ 代理验证成功，使用独立IP\n`);
            } else {
                const existingProxy = proxyIPs.get(ip);
                console.error(`\n✗ 警告: 发现重复的IP!`);
                console.error(`  ${proxy.ip}:${proxy.port} 和 ${existingProxy.ip}:${existingProxy.port} 使用了相同的IP: ${ip}\n`);
            }
            
        } catch (error) {
            console.error(`✗ 代理验证失败 (${proxy.ip}:${proxy.port}):`, error.message, '\n');
        } finally {
            await browser.close();
        }
        
        if (validProxies.length >= 9) {
            console.log('已找到9个使用不同IP的代理，停止验证其余代理');
            break;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n代理验证结果:');
    for (const proxy of validProxies) {
        console.log(`${proxy.ip}:${proxy.port} => ${proxy.actualIP}`);
    }

    return validProxies;
}

async function main() {
    // 随机打乱代理列表
    const shuffledProxies = [...PROXY_LIST].sort(() => Math.random() - 0.5);
    
    // 验证代理并获取9个不同IP的代理
    console.log('正在寻找9个使用不同IP的代理...');
    const validProxies = await verifyAllProxies(shuffledProxies);
    
    if (validProxies.length < 9) {
        console.error(`错误：只找到 ${validProxies.length} 个不同IP的代理，需要9个`);
        process.exit(1);
    }

    console.log('\n成功找到9个不同IP的代理，开始爬取数据...\n');
    console.log('将处理以下年份:', YEARS.join(', '));

    // 创建年份和代理的配对数组
    const tasks = YEARS.map((year, index) => ({
        year,
        proxy: validProxies[index]
    }));

    // 并行执行所有任务
    const results = await Promise.allSettled(
        tasks.map(async ({ year, proxy }) => {
            try {
                console.log(`开始处理 ${year} 年数据`);
                await scrapeWithProxy(year, proxy);
                console.log(`✓ ${year}年数据处理完成`);
                return { year, success: true };
            } catch (error) {
                console.error(`✗ ${year}年数据处理失败:`, error.message);
                return { year, success: false, error: error.message };
            }
        })
    );

    // 输出最终结果统计
    console.log('\n爬取结果统计:');
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.filter(r => r.status === 'fulfilled' && !r.value.success).length;
    
    console.log(`成功: ${successful}`);
    console.log(`失败: ${failed}`);
    
    // 输出失败的年份
    const failedYears = results
        .filter(r => r.status === 'fulfilled' && !r.value.success)
        .map(r => r.value.year);
    
    if (failedYears.length > 0) {
        console.log('\n失败的年份:', failedYears.join(', '));
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    scrapeWithProxy
}; 