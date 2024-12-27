const puppeteer = require('puppeteer');
const proxyChain = require('proxy-chain');

const proxyServer = 'cn-pr.oxylabs.io:30002';
const username = 'dailycafi_OeqdP';
const password = 'Cinbofei3loushab_';

async function launchBrowserWithProxy() {
    const proxy = `http://${username}:${password}@${proxyServer}`;
    console.log('使用的代理:', proxy);

    const anonymizedProxy = await proxyChain.anonymizeProxy(proxy);
    console.log('匿名代理URL:', anonymizedProxy);

    const browser = await puppeteer.launch({
        headless: true,
        args: [`--proxy-server=${anonymizedProxy}`],
        ignoreHTTPSErrors: true
    });

    return { browser, anonymizedProxy };
}

async function runTest() {
    const url = 'https://kd.nsfc.cn/finalProjectInit?advanced=true';
    const { browser, anonymizedProxy } = await launchBrowserWithProxy();
    const page = await browser.newPage();

    try {
        console.log('正在访问页面...');
        await page.goto(url, {
            waitUntil: 'networkidle0',
            timeout: 60000
        });
        const pageText = await page.evaluate(() => document.body.innerText);
        console.log('页面内容:', pageText);
    } catch (error) {
        console.error('访问页面时出错:', error);
    } finally {
        await browser.close();
        await proxyChain.closeAnonymizedProxy(anonymizedProxy, true);
    }
}

runTest().catch(console.error);
