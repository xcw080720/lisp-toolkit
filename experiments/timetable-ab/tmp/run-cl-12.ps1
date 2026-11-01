$ErrorActionPreference = 'Continue'
Set-Location "C:\Users\HUAWEI\Documents\deepseek-harness\default-workspace\lisp-toolkit\experiments\timetable-ab"
$env:DEEPSEEK_API_KEY = ([regex]::Match((Get-Content "$env:USERPROFILE\.dsh\.credentials.yaml" -Raw -Encoding utf8),'DEEPSEEK_API_KEY:\s*(\S+)')).Groups[1].Value

Write-Output "=== ARM 1 v4-cl-macro start $(Get-Date -Format o) ==="
node b1-gen.cjs --arm v4-cl-macro  --from 1 --to 6 --prompt-file runs\prompts\v4-cl-macro.txt
Write-Output "=== ARM 1 exit=$LASTEXITCODE end $(Get-Date -Format o) ==="

Write-Output "=== ARM 2 v4-cl-inline start $(Get-Date -Format o) ==="
node b1-gen.cjs --arm v4-cl-inline --from 1 --to 6 --prompt-file runs\prompts\v4-cl-inline.txt
Write-Output "=== ARM 2 exit=$LASTEXITCODE end $(Get-Date -Format o) ==="
