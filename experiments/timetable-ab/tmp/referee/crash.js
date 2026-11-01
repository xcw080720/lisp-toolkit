// 复核用：每次运行都抛异常的坏实现，用来检验 check-scale 会不会"假绿"
process.stderr.write('boom\n');
throw new Error('boom');
