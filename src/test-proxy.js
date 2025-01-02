const https = require('https');
const puppeteer = require('puppeteer');
const zlib = require("zlib");
const path = require('path');

// 加载环境变量
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// 从环境变量获取配置
const PROXY_CUSTOMER = process.env.PROXY_CUSTOMER;
const PROXY_PASSWORD = process.env.PROXY_PASSWORD;

// 验证环境变量是否存在
if (!PROXY_CUSTOMER || !PROXY_PASSWORD) {
    console.error('错误: 环境变量未设置。请确保 .env 文件中包含 PROXY_CUSTOMER 和 PROXY_PASSWORD');
    process.exit(1);
}

const getAddress = "https://dps.kdlapi.com/api/getdps/?secret_id=o0oeluds2tkht8n2pfj5&signature=lnuv3xk2i06gotnv8b17tzcy2murv1kr&num=1&pt=1&format=text&sep=1";
const url = 'https://dev.kdlapi.com/testproxy';
const headers = {
    'Accept-Encoding': 'gzip'
};
let proxy_ip = '';
let proxy_port = '';

const base64 = Buffer.from(PROXY_CUSTOMER + ":" + PROXY_PASSWORD).toString("base64");

console.log('开始获取代理IP...');
console.log('代理用户:', PROXY_CUSTOMER);
console.log('代理密码:', PROXY_PASSWORD.substring(0, 2) + '****');

https.get(getAddress, {
    headers: {
        'Authorization': 'Basic ' + base64
    }
}, (res) => {
    let stream = res;

    if (res.headers['content-encoding'] && res.headers['content-encoding'].toLowerCase() === 'gzip') {
        stream = stream.pipe(zlib.createGunzip());
    }

    stream.on('data', (chunk) => {
        const data = chunk.toString();
        const parts = data.split(':');
        proxy_ip = parts[0];
        proxy_port = parts[1];

        console.log(`获取到代理: ${proxy_ip}:${proxy_port}`);

        (async () => {
            let browser;
            try {
                console.log('启动浏览器...');
                browser = await puppeteer.launch({
                    headless: false,
                    args: [
                        `--proxy-server=${proxy_ip}:${proxy_port}`,
                        '--no-sandbox',
                        '--disable-setuid-sandbox'
                    ]
                });

                // 打开一个新页面
                const page = await browser.newPage();

                // 设置headers
                await page.setExtraHTTPHeaders(headers);

                // 使用环境变量中的认证信息
                await page.authenticate({
                    username: PROXY_CUSTOMER, 
                    password: PROXY_PASSWORD
                });

                // 访问目标网页
                console.log('正在访问目标页面...');
                const response = await page.goto(url, {
                    waitUntil: 'networkidle0',
                    timeout: 30000
                });

                console.log(`页面状态码: ${response.status()}`);

            } catch (error) {
                console.error('发生错误:', error);
            } finally {
                if (browser) {
                    await browser.close();
                }
            }
        })();
    });
}).on('error', (err) => {
    console.error('Error sending request to getAddress:', err);
});
async function testProxy() {
    // 快代理API配置
    const getAddress = "https://dps.kdlapi.com/api/getdps/?secret_id=o0oeluds2tkht8n2pfj5&signature=lnuv3xk2i06gotnv8b17tzcy2murv1kr&num=1&pt=1&format=text&sep=1";
    
    console.log('\n=== 代理配置信息 ===');
    console.log('用户名:', PROXY_CUSTOMER);
    console.log('密码:', PROXY_PASSWORD.substring(0, 2) + '****');

    // 获取代理IP
    const proxyInfo = await new Promise((resolve, reject) => {
        https.get(getAddress, {
            headers: {
                'Authorization': 'Basic ' + Buffer.from(PROXY_CUSTOMER + ":" + PROXY_PASSWORD).toString("base64")
            }
        }, (res) => {
            let stream = res;

            if (res.headers['content-encoding'] && res.headers['content-encoding'].toLowerCase() === 'gzip') {
                stream = stream.pipe(zlib.createGunzip());
            }

            stream.on('data', (chunk) => {
                const data = chunk.toString();
                const [ip, port] = data.split(':');
                resolve({ ip, port });
            });
        }).on('error', reject);
    });

    console.log('\n=== 代理测试开始 ===');
    console.log(`获取到代理: ${proxyInfo.ip}:${proxyInfo.port}`);

    try {
        // 启动浏览器
        const browser = await puppeteer.launch({
            headless: false,  // 设为false以便观察
            args: [
                `--proxy-server=${proxyInfo.ip}:${proxyInfo.port}`,
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ]
        });

        // 创建新页面
        const page = await browser.newPage();

        // 设置代理认证
        await page.authenticate({
            username: PROXY_CUSTOMER,
            password: PROXY_PASSWORD
        });

        // 测试步骤1: 验证IP
        console.log('\n1. 验证代理IP...');
        await page.goto('http://httpbin.org/ip', {
            waitUntil: 'networkidle0',
            timeout: 30000
        });
        const ipInfo = await page.evaluate(() => {
            return document.body.textContent;
        });
        console.log('当前IP信息:', ipInfo);

        // 测试步骤2: 访问目标网站
        console.log('\n2. 测试目标网站访问...');
        const targetUrl = 'https://kd.nsfc.cn/finalProjectInit?advanced=true';
        const startTime = Date.now();
        
        const response = await page.goto(targetUrl, {
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        const loadTime = Date.now() - startTime;
        console.log(`页面加载时间: ${loadTime}ms`);
        console.log(`状态码: ${response.status()}`);
        
        // 获取页面标题
        const title = await page.title();
        console.log(`页面标题: ${title}`);

        // 等待一段时间以便观察
        await new Promise(resolve => setTimeout(resolve, 5000));

        // 关闭浏览器
        await browser.close();

        console.log('\n=== 测试结果 ===');
        console.log('✅ 测试成功完成');
        console.log(`代理地址: ${proxyInfo.ip}:${proxyInfo.port}`);
        console.log(`页面加载时间: ${loadTime}ms`);
        console.log(`状态码: ${response.status()}`);

    } catch (error) {
        console.error('\n=== 测试失败 ===');
        console.error('错误信息:', error.message);
        console.error(`使用的代理: ${proxyInfo.ip}:${proxyInfo.port}`);
    }
}

// 运行测试
testProxy().catch(console.error);