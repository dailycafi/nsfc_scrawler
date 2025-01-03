// 基金类型配置
const FUND_TYPES = [
    "面上项目",
    "重点项目",
    "重大研究计划",
    "联合基金项目",
    "青年科学基金项目",
    "地区科学基金项目",
    "专项基金项目"
];

// 年份和代理的固定对应关系
const YEAR_PROXY_MAP = {
    2011: { id: 'lrps-86384', ip: '36.25.243.5', port: '10859', location: '郑州市', isp: '移动' },
    2012: { id: 'lrps-86380', ip: '36.25.243.5', port: '10857', location: '四平市', isp: '联通' },
    // 2012: { id: 'lrps-06377', ip: '36.25.243.5', port: '11889', location: '天津市', isp: '联通' },
    // 2013: { id: 'lrps-06369', ip: '36.25.243.5', port: '10852', location: '济宁市', isp: '联通' },
    2013: { id: 'lrps-86381', ip: '36.151.192.236', port: '11723', location: '上海市', isp: '电信' },
    // 2014: { id: 'lrps-06370', ip: '36.25.243.5', port: '11861', location: '邯郸市', isp: '联通' },
    2014: { id: 'lrps-86382', ip: '36.25.243.5', port: '11920', location: '邵阳市', isp: '联通' },
    2015: { id: 'lrps-06373', ip: '61.184.8.27', port: '11789', location: '东莞市', isp: '电信' },
    2017: { id: 'lrps-06374', ip: '61.184.8.27', port: '11790', location: '天津市', isp: '联通' },
    2018: { id: 'lrps-06375', ip: '61.184.8.27', port: '11791', location: '运城市', isp: '联通' },
    2019: { id: 'lrps-06376', ip: '61.184.8.27', port: '11792', location: '河池市', isp: '-' },
    2020: { id: 'lrps-06377', ip: '61.184.8.27', port: '11793', location: '抚州市', isp: '电信' },
    2021: { id: 'lrps-06375', ip: '36.151.192.236', port: '11722', location: '淄博', isp: '电信' },
    2022: { id: 'lrps-06376', ip: '36.151.192.236', port: '11720', location: '嘉兴市', isp: '电信' }
};



// 代理认证信息
const PROXY_AUTH = {
    username: 'qgpjclvx',
    password: 'npd7cjmz'
};

module.exports = {
    FUND_TYPES,
    YEAR_PROXY_MAP,
    PROXY_AUTH
};
