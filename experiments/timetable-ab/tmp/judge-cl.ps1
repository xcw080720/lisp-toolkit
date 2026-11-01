$ErrorActionPreference = 'Continue'
Set-Location "C:\Users\HUAWEI\Documents\deepseek-harness\default-workspace\lisp-toolkit\experiments\timetable-ab"
$env:SBCL_WSL = 'kali-linux'

$rows = @()
foreach ($arm in @('v4-cl-macro','v4-cl-inline')) {
  foreach ($r in 1..6) {
    $impl = "runs\$arm-r$r\impl.lisp"
    if (-not (Test-Path $impl)) {
      Write-Output "[MISSING] $impl"
      $rows += [pscustomobject]@{ arm=$arm; run=$r; chars=''; lines=''; code_lines=''; u36p=''; u36t=''; u36fail=''; u56p=''; u56t=''; out_tok=''; finish=''; elapsed='' }
      continue
    }
    # metric
    $mj = (node metric.cjs $impl | Select-String -Pattern '^JSON: ').ToString().Substring(6)
    $m = $mj | ConvertFrom-Json
    # upto36
    $o36 = node check-v3.cjs --impl $impl --upto 36 2>&1 | Out-String
    $o36 | Out-File -FilePath "tmp\judge-$arm-r$r-u36.txt" -Encoding utf8
    # upto56
    $o56 = node check-v3.cjs --impl $impl --upto 56 2>&1 | Out-String
    $o56 | Out-File -FilePath "tmp\judge-$arm-r$r-u56.txt" -Encoding utf8

    function P($txt) {
      $mm = [regex]::Matches($txt, '#\s*(\d+)\s+(FAIL|CRASH)')
      $ids = @(); foreach ($x in $mm) { $ids += $x.Groups[1].Value }
      $t = [regex]::Match($txt, '(\d+)/(\d+)')
      return [pscustomobject]@{ pass = $(if($t.Success){[int]$t.Groups[1].Value}else{-1}); total = $(if($t.Success){[int]$t.Groups[2].Value}else{-1}); ids = ($ids -join ',') }
    }
    $p36 = P $o36
    $p56 = P $o56

    $log = Get-Content "runs\$arm-r$r\log.txt" -Raw
    $fm = [regex]::Match($log, 'finish_reason=(\S+)')
    $om = [regex]::Match($log, 'usage_completion=(\d+)')
    $em = [regex]::Match($log, 'elapsed_ms=(\d+)')
    $rows += [pscustomobject]@{
      arm = $arm; run = $r; chars = $m.chars; lines = $m.lines; code_lines = $m.codeLines
      u36p = $p36.pass; u36t = $p36.total; u36fail = $p36.ids
      u56p = $p56.pass; u56t = $p56.total
      out_tok = $(if($om.Success){$om.Groups[1].Value}else{'NA'})
      finish = $(if($fm.Success){$fm.Groups[1].Value}else{'NA'})
      elapsed = $(if($em.Success){[math]::Round([int]$em.Groups[1].Value/1000,1)}else{'NA'})
    }
    Write-Output ("[$arm r$r] chars=$($m.chars) u36=$($p36.pass)/$($p36.total) fail=[$($p36.ids)] u56=$($p56.pass)/$($p56.total) out=$($om.Groups[1].Value) fin=$($fm.Groups[1].Value)")
  }
}

$hdr = "arm`trun`tchars`tlines`tcode_lines`tupto36_pass`tupto36_total`tupto36_fail_ids`tupto56_pass`tupto56_total`tout_tok`tfinish`telapsed_s"
$lines = @($hdr)
foreach ($x in $rows) {
  $lines += ("{0}`t{1}`t{2}`t{3}`t{4}`t{5}`t{6}`t{7}`t{8}`t{9}`t{10}`t{11}`t{12}" -f $x.arm,$x.run,$x.chars,$x.lines,$x.code_lines,$x.u36p,$x.u36t,$x.u36fail,$x.u56p,$x.u56t,$x.out_tok,$x.finish,$x.elapsed)
}
Set-Content -Path 'v4-results-cl.tsv' -Value $lines -Encoding utf8
Write-Output '--- TSV written ---'
$lines | ForEach-Object { Write-Output $_ }
