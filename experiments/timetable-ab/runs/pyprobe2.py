import sys, json
data = json.load(open(sys.argv[1], encoding="utf-8"))
print(json.dumps({"opsText":"","courses":[],"log":["输入收到 %d 个 op" % len(data.get("ops",[]))],"n":0}))