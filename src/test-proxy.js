const puppeteer = require('puppeteer');
const proxyChain = require('proxy-chain');
const fs = require('fs').promises;
const { sleep } = require('./utils');

const username = 'feistar_OuMYd';
const password = 'Cinbofei3loushab_';

async function launchBrowserWithProxy(proxyServer) {
    const proxy = `http://customer-${username}:${password}@${proxyServer}`;
    const anonymizedProxy = await proxyChain.anonymizeProxy(proxy);
    const browser = await puppeteer.launch({
        headless: true,
        args: [`--proxy-server=${anonymizedProxy}`],
        ignoreHTTPSErrors: true
    });
    return { browser, anonymizedProxy };
}

async function testProxyPort(port, url) {
    const startTime = Date.now();
    const proxyWithPort = `cn-pr.oxylabs.io:${port}`;
    
    try {
        console.log(`正在测试端口 ${port}...`);
        const { browser, anonymizedProxy } = await launchBrowserWithProxy(proxyWithPort);
        const page = await browser.newPage();

        try {
            await page.setRequestInterception(true);
            page.on('request', (request) => {
                const resourceType = request.resourceType();
                if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                    request.abort();
                } else {
                    request.continue();
                }
            });

            console.log(`端口 ${port}: 开始访问目标网站...`);
            await page.goto('https://kd.nsfc.cn/finalProjectInit?advanced=true', {
                waitUntil: 'domcontentloaded',
                timeout: 20000
            });
            
            const responseTime = Date.now() - startTime;
            console.log(`端口 ${port}: 成功访问，耗时 ${responseTime}ms`);
            
            await browser.close();
            await proxyChain.closeAnonymizedProxy(anonymizedProxy, true);
            
            return {
                port,
                success: true,
                responseTime,
                error: null
            };
        } catch (error) {
            console.error(`端口 ${port} 访问失败:`, error.message);
            await browser.close();
            await proxyChain.closeAnonymizedProxy(anonymizedProxy, true);
            throw error;
        }
    } catch (error) {
        console.error(`端口 ${port} 代理设置失败:`, error.message);
        return {
            port,
            success: false,
            responseTime: null,
            error: error.message
        };
    }
}

async function saveResultsToFile(successfulPorts) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `proxy-test-results-${timestamp}.txt`;
    
    let content = '代理端口测试结果报告\n';
    content += '===================\n\n';
    content += `测试时间: ${new Date().toLocaleString()}\n`;
    content += `成功端口数量: ${successfulPorts.length}\n\n`;
    content += '详细结果 (按响应时间排序):\n';
    content += '端口号\t总响应时间\t代理测试时间\t目标网站响应时间\n';
    
    successfulPorts.forEach(({port, totalResponseTime, proxyTestTime, targetTestTime}) => {
        content += `${port}\t${totalResponseTime}ms\t${proxyTestTime}ms\t${targetTestTime}ms\n`;
    });
    
    await fs.writeFile(filename, content, 'utf8');
    console.log(`\n测试结果已保存到文件: ${filename}`);
}

async function testPortRange(startPort, endPort, url, batchSize = 20) {
    const results = [];
    const successfulPorts = [];
    const totalPorts = endPort - startPort + 1;
    const totalBatches = Math.ceil(totalPorts / batchSize);
    
    console.log(`开始并行测试端口 ${startPort} 到 ${endPort}...`);
    console.log(`总共 ${totalBatches} 批，每批 ${batchSize} 个端口\n`);
    
    for (let i = 0; i < totalPorts; i += batchSize) {
        const batchNumber = Math.floor(i / batchSize) + 1;
        const batch = [];
        const batchEnd = Math.min(i + batchSize, totalPorts);
        
        for (let j = 0; j < batchEnd - i; j++) {
            const port = startPort + i + j;
            batch.push(testProxyPort(port, url));
        }
        
        console.log(`\n开始测试第 ${batchNumber}/${totalBatches} 批 (端口 ${startPort + i} - ${startPort + batchEnd - 1})`);
        
        const batchResults = await Promise.all(batch);
        
        // 处理本批次结果
        const batchSuccessful = [];
        let batchFailures = 0;
        
        batchResults.forEach(result => {
            if (result.success) {
                batchSuccessful.push({
                    port: result.port,
                    responseTime: result.responseTime
                });
                successfulPorts.push({
                    port: result.port,
                    responseTime: result.responseTime
                });
            } else {
                batchFailures++;
            }
        });
        
        // 输出本批次报告
        console.log(`\n第 ${batchNumber} 批测试完成:`);
        console.log(`- 成功: ${batchSuccessful.length} 个端口`);
        console.log(`- 失败: ${batchFailures} 个端口`);
        if (batchSuccessful.length > 0) {
            console.log('本批次成功端口:');
            batchSuccessful
                .sort((a, b) => a.responseTime - b.responseTime)
                .forEach(({port, responseTime}) => {
                    console.log(`  端口 ${port}: 响应时间 ${responseTime}ms`);
                });
        }

        // 强制执行垃圾回收
        if (global.gc) {
            global.gc();
        }
        
        // 在批次之间添加短暂延迟，让系统有时间清理资源
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // 最终报告
    console.log('\n\n=== 最终测试结果汇总 ===');
    console.log(`总测试端口数: ${totalPorts}`);
    console.log(`成功端口数: ${successfulPorts.length}`);
    console.log(`失败端口数: ${totalPorts - successfulPorts.length}`);
    
    if (successfulPorts.length > 0) {
        console.log('\n所有成功端口 (按响应时间排序):');
        successfulPorts
            .sort((a, b) => a.responseTime - b.responseTime)
            .forEach(({port, responseTime}) => {
                console.log(`端口 ${port}: ${responseTime}ms`);
            });
    }
    
    return successfulPorts;
}

// 修改主函数
(async () => {
    try {
        const url = 'https://kd.nsfc.cn/finalProjectInit?advanced=true';
        const startPort = 30001;
        const endPort = 39999;
        const batchSize = 15;  // 减小批次大小
        
        console.log('开始测试...');
        await testPortRange(startPort, endPort, url, batchSize);
    } catch (error) {
        console.error('程序执行出错:', error);
    }
})();

process.on('SIGINT', () => {
    console.log('\n程序已终止');
    process.exit(0);
});