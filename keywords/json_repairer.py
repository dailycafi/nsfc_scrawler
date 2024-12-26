import json
import ast
import re

def process_json_files():
    final_result = {}
    
    for file_name in ['res_1.txt', 'res_2.txt']:
        with open(file_name, 'r', encoding='utf-8') as f:
            for line_number, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                
                try:
                    # 首先尝试直接解析
                    data = ast.literal_eval(line)
                    top_category = list(data.keys())[0]
                    
                    # 只处理形如 'C1', 'C2' 等的顶层类别
                    if not re.match(r'^C\d+$', top_category):
                        continue
                        
                    if top_category not in final_result:
                        final_result[top_category] = set()
                    
                    # 遍历子类
                    for subcategory in data[top_category].values():
                        if not subcategory:
                            continue
                        # 遍历方向
                        for keywords in subcategory.values():
                            if isinstance(keywords, list):
                                final_result[top_category].update(keywords)
                            
                except Exception as e:
                    # 如果解析失败，尝试分割多个字典
                    try:
                        # 使用更精确的正则表达式找到所有的字典
                        pattern = r'({[^{}]*(?:{[^{}]*})*[^{}]*})'
                        dict_matches = re.findall(pattern, line)
                        
                        for dict_str in dict_matches:
                            # 验证花括号是否匹配
                            if dict_str.count('{') != dict_str.count('}'):
                                continue
                                
                            try:
                                data = ast.literal_eval(dict_str)
                                top_category = list(data.keys())[0]
                                
                                # 只处理形如 'C1', 'C2' 等的顶层类别
                                if not re.match(r'^C\d+$', top_category):
                                    continue
                                    
                                if top_category not in final_result:
                                    final_result[top_category] = set()
                                
                                for subcategory in data[top_category].values():
                                    if not subcategory:
                                        continue
                                    for keywords in subcategory.values():
                                        if isinstance(keywords, list):
                                            final_result[top_category].update(keywords)
                            except Exception as e3:
                                continue
                                
                        print(f"成功分割并处理了第 {line_number} 行的字典")
                    except Exception as e2:
                        print(f"\n文件 {file_name} 第 {line_number} 行出错:")
                        print(f"错误类型: {type(e2).__name__}")
                        print(f"错误信息: {str(e2)}")
                        print("---")
    
    # 将集合转换回列表并排序
    for category in final_result:
        final_result[category] = sorted(list(final_result[category]))
    
    # 将结果写入新文件
    with open('combined_result.json', 'w', encoding='utf-8') as f:
        json.dump(final_result, f, ensure_ascii=False, indent=2)

    # 打印统计信息
    print("\n处理完成！")
    print(f"共整理出 {len(final_result)} 个顶层类别:")
    for category in sorted(final_result.keys()):
        print(f"{category}: {len(final_result[category])} 个关键词")

if __name__ == "__main__":
    result = process_json_files()