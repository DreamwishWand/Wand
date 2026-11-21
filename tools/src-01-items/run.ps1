param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
)
$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'src01_items.py'
& py -3 $scriptPath @Arguments
exit $LASTEXITCODE
