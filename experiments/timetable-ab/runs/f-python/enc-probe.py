import json, sys, locale
print("stdout.encoding =", sys.stdout.encoding, "preferred =", locale.getpreferredencoding())
print(json.dumps({"name": "数据结构🐋"}, ensure_ascii=False))
