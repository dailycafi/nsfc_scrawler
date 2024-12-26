const puppeteer = require('puppeteer');
const fs = require('fs');

// 延时函数
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 展开部门的辅助函数
async function expandDepartment(page, deptTitle) {
  console.log(`尝试展开部门: ${deptTitle}`);
  try {
    await page.waitForSelector('.ant-tree-title', { timeout: 5000 });
    const deptNodes = await page.$$('.ant-tree-title');
    
    for (const node of deptNodes) {
      const titleText = await node.evaluate(el => el.textContent.trim());
      if (titleText === deptTitle) {
        await node.evaluate(el => {
          const li = el.closest('li');
          const switcher = li.querySelector('.ant-tree-switcher');
          if (switcher) switcher.click();
        });
        await sleep(1000);
        console.log(`成功展开部门: ${deptTitle}`);
        return true;
      }
    }
    console.log(`未找到部门: ${deptTitle}`);
    return false;
  } catch (err) {
    console.error(`展开部门 ${deptTitle} 时出错:`, err);
    return false;
  }
}

// 展开主类的辅助函数
async function expandMainCategory(page, mainCode) {
  console.log(`尝试展开主类: ${mainCode}`);
  try {
    const mainNodes = await page.$$('.ant-tree-title');
    for (const node of mainNodes) {
      const titleText = await node.evaluate(el => el.textContent.trim());
      if (titleText.startsWith(mainCode)) {
        await node.evaluate(el => {
          const li = el.closest('li');
          const switcher = li.querySelector('.ant-tree-switcher');
          if (switcher) switcher.click();
        });
        await sleep(1000);
        console.log(`成功展开主类: ${mainCode}`);
        return true;
      }
    }
    console.log(`未找到主类: ${mainCode}`);
    return false;
  } catch (err) {
    console.error(`展开主类 ${mainCode} 时出错:`, err);
    return false;
  }
}

// 将结果保存为 CSV
function saveToCSV(results, filename) {
  let csvContent = 'mainCode,mainName,subCode,subName\n';
  
  Object.entries(results).forEach(([mainCode, data]) => {
    const mainName = data.mainName;
    data.subCodes.forEach(sub => {
      const safeName = `"${sub.name.replace(/"/g, '""')}"`;
      const safeMainName = `"${mainName.replace(/"/g, '""')}"`;
      csvContent += `${mainCode},${safeMainName},${sub.code},${safeName}\n`;
    });
  });

  fs.writeFileSync(filename, csvContent, 'utf-8');
  console.log(`\n结果已保存到 ${filename}`);
}

// 获取指定部门的子类代码
async function getDepartmentSubCodes(page, dept) {
  const results = {};
  
  console.log(`\n开始处理 ${dept}...`);
  
  await page.click('label[for="code"] ~ .el-form-item__content .el-input input[readonly]');
  await sleep(2000);

  await page.waitForSelector('.ant-tree', { visible: true, timeout: 5000 });
  await sleep(1000);

  const expanded = await expandDepartment(page, dept);
  if (!expanded) {
    console.log(`跳过部门 ${dept}`);
    return results;
  }
  await sleep(2000);

  const mainCodes = await page.evaluate((deptPrefix) => {
    const titles = Array.from(document.querySelectorAll('.ant-tree-title'));
    return titles
      .filter(el => el.textContent.trim().startsWith(deptPrefix.charAt(0)))
      .map(el => {
        const text = el.textContent.trim();
        const [code, ...nameParts] = text.split(' ');
        return {
          code: code,
          name: nameParts.join(' ')
        };
      })
      .filter(item => item.code.length === 3);
  }, dept.charAt(0));

  console.log(`找到主类代码: ${mainCodes.map(m => m.code).join(', ')}`);

  for (const mainItem of mainCodes) {
    console.log(`\n处理主类 ${mainItem.code}...`);
    
    const mainExpanded = await expandMainCategory(page, mainItem.code);
    if (!mainExpanded) {
      console.log(`跳过主类 ${mainItem.code}`);
      continue;
    }
    await sleep(2000);

    const subCodes = await page.evaluate((mainCode) => {
      const mainTitle = Array.from(document.querySelectorAll('.ant-tree-title'))
        .find(el => el.textContent.trim().startsWith(mainCode));
      
      if (!mainTitle) return [];
      
      const mainLi = mainTitle.closest('li');
      if (!mainLi) return [];
      
      const subItems = mainLi.querySelectorAll(':scope > ul.ant-tree-child-tree > li');
      
      return Array.from(subItems)
        .map(item => {
          const title = item.querySelector('.ant-tree-title');
          if (!title) return null;
          const text = title.textContent.trim();
          const [code, ...nameParts] = text.split(' ');
          return {
            code: code,
            name: nameParts.join(' ')
          };
        })
        .filter(Boolean);
    }, mainItem.code);

    console.log(`找到 ${subCodes.length} 个子类`);

    if (subCodes.length > 0) {
      results[mainItem.code] = {
        mainName: mainItem.name,
        subCodes: subCodes
      };
    }
  }

  return results;
}

// 主函数
async function getAllSubCodes() {
  const browser = await puppeteer.launch({ 
    headless: false,
    defaultViewport: null
  });
  
  try {
    // 处理 C 部门
    const page = await browser.newPage();
    await page.goto('https://kd.nsfc.cn/finalProjectInit?advanced=true', { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    await page.waitForSelector('.el-collapse-item.is-active', { timeout: 10000 });
    await sleep(1000);

    const cResults = await getDepartmentSubCodes(page, 'C 生命科学部');
    saveToCSV(cResults, 'subcodes_C.csv');
    const cJson = JSON.stringify(cResults, null, 2);
    fs.writeFileSync('subcodes_C.json', cJson);
    
    // 关闭页面，重新打开新页面处理 H 部门
    await page.close();
    const newPage = await browser.newPage();
    await newPage.goto('https://kd.nsfc.cn/finalProjectInit?advanced=true', { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    await newPage.waitForSelector('.el-collapse-item.is-active', { timeout: 10000 });
    await sleep(1000);

    const hResults = await getDepartmentSubCodes(newPage, 'H 医学科学部');
    saveToCSV(hResults, 'subcodes_H.csv');
    const hJson = JSON.stringify(hResults, null, 2);
    fs.writeFileSync('subcodes_H.json', hJson);

  } catch (err) {
    console.error('获取子类代码时出错:', err);
  } finally {
    await browser.close();
  }
}

// 运行脚本
getAllSubCodes().catch(console.error);
