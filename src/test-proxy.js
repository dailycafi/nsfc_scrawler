const puppeteer = require('puppeteer');
const OxylabsManager = require('./proxy/OxylabsManager');
const oxyConfig = require('./config/oxylabs');

async function testProxy() {
    console.log('开始测试 Oxylabs 代理...');
    
    const proxyManager = new OxylabsManager(oxyConfig);
    const { proxyUrl } = proxyManager.getProxyUrl();
    
    console.log('使用代理URL:', proxyUrl);

    try {
        const browser = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                `--proxy-server=${proxyUrl}`
            ]
        });

        const page = await browser.newPage();
        
        // 设置代理认证
        await page.authenticate({
            username: `customer-${oxyConfig.username}`,
            password: oxyConfig.password
        });

        // 先测试 Oxylabs 的 IP 检测页面
        console.log('\n1. 测试 Oxylabs IP 检测...');
        await page.goto('https://ip.oxylabs.io/location');
        let content = await page.evaluate(() => document.body.textContent);
        console.log('Oxylabs IP 信息:', content);

        // 测试目标网站
        console.log('\n2. 测试目标网站访问...');
        await page.goto('https://kd.nsfc.gov.cn/');
        const title = await page.title();
        console.log('网站标题:', title);

        await browser.close();
        console.log('\n测试完成！');

    } catch (error) {
        console.error('测试过程中出现错误:', error);
    }
}

// 运行测试
testProxy().catch(console.error); 