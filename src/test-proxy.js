const puppeteer = require('puppeteer');

async function testProxy() {
    const proxyServer = '36.25.243.5:11839';
    
    console.log(`开始测试代理: ${proxyServer}`);
    
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
        const page = await browser.newPage();
        
        // 设置随机UA
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        console.log('正在测试连接...');
        
        // 测试目标网站连接
        console.log('测试访问目标网站...');
        await page.goto('https://kd.nsfc.cn/finalProjectInit?advanced=true', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // 获取页面标题
        const title = await page.title();
        console.log('页面标题:', title);

        // 检查是否成功加载
        const content = await page.content();
        if (content.includes('国家自然科学基金')) {
            console.log('✅ 代理测试成功！可以正常访问目标网站');
        } else {
            console.log('❌ 代理测试失败：无法正确加载页面内容');
        }

        // 获取当前IP（通过访问ip查询网站）
        console.log('\n检查当前IP...');
        await page.goto('http://ip-api.com/json', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });
        
        const ipInfo = await page.evaluate(() => {
            return JSON.parse(document.querySelector('body').innerText);
        });
        
        console.log('当前IP信息:', {
            ip: ipInfo.query,
            country: ipInfo.country,
            region: ipInfo.regionName,
            city: ipInfo.city,
            isp: ipInfo.isp
        });

    } catch (error) {
        console.error('❌ 测试过程中出现错误:', error.message);
    } finally {
        await browser.close();
        console.log('\n测试完成');
    }
}

// 运行测试
testProxy().catch(console.error);