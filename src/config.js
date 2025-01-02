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
    2009: { id: 'lrps-86384', ip: '36.25.243.5', port: '10859', location: '郑州市', isp: '移动' },
    2010: { id: 'lrps-06377', ip: '36.25.243.5', port: '11889', location: '天津市', isp: '联通' },
    2011: { id: 'lrps-06369', ip: '36.25.243.5', port: '10852', location: '济宁市', isp: '联通' },
    2012: { id: 'lrps-06370', ip: '36.25.243.5', port: '11861', location: '邯郸市', isp: '联通' },
    2013: { id: 'lrps-06371', ip: '36.25.243.5', port: '10853', location: '南昌市', isp: '电信' },
    2014: { id: 'lrps-06372', ip: '36.25.243.5', port: '11865', location: '天津市', isp: '联通' },
    2015: { id: 'lrps-06373', ip: '36.25.243.5', port: '11876', location: '运城市', isp: '联通' },
    2016: { id: 'lrps-86383', ip: '36.25.243.5', port: '11921', location: '天津市', isp: '-' },
    2017: { id: 'lrps-06374', ip: '36.25.243.5', port: '10854', location: '抚州市', isp: '电信' },
    2018: { id: 'lrps-06375', ip: '36.25.243.5', port: '11885', location: '湛江市', isp: '移动' },
    2019: { id: 'lrps-06376', ip: '36.25.243.5', port: '10855', location: '娄底市', isp: '电信' },
    2020: { id: 'lrps-86380', ip: '36.25.243.5', port: '10857', location: '四平市', isp: '联通' },
    2021: { id: 'lrps-86381', ip: '36.25.243.5', port: '10858', location: '黄山市', isp: '移动' },
    2022: { id: 'lrps-86382', ip: '36.25.243.5', port: '11920', location: '邵阳市', isp: '联通' }
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
