# Servidor estatico minimo para probar la app en local (no hay node en este PC).
$raiz = $PSScriptRoot
$puerto = 8901
$oyente = New-Object System.Net.HttpListener
$oyente.Prefixes.Add("http://localhost:$puerto/")
$oyente.Start()
Write-Host "Sirviendo $raiz en http://localhost:$puerto/"

$tipos = @{
  '.html'='text/html; charset=utf-8'; '.js'='application/javascript; charset=utf-8';
  '.css'='text/css; charset=utf-8';  '.json'='application/json; charset=utf-8';
  '.svg'='image/svg+xml'; '.png'='image/png'; '.jpg'='image/jpeg';
  '.webmanifest'='application/manifest+json'; '.ico'='image/x-icon'
}

while ($oyente.IsListening) {
  try {
    $ctx = $oyente.GetContext()
    $ruta = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($ruta -eq '/') { $ruta = '/index.html' }
    $archivo = Join-Path $raiz ($ruta.TrimStart('/') -replace '/','\')

    if (Test-Path $archivo -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($archivo).ToLower()
      $ctx.Response.ContentType = if ($tipos.ContainsKey($ext)) { $tipos[$ext] } else { 'application/octet-stream' }
      # Sin cache: en pruebas, un archivo viejo cuesta mas que un byte de mas.
      $ctx.Response.Headers.Add('Cache-Control','no-store')
      $bytes = [System.IO.File]::ReadAllBytes($archivo)
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $b = [System.Text.Encoding]::UTF8.GetBytes('404')
      $ctx.Response.OutputStream.Write($b, 0, $b.Length)
    }
    $ctx.Response.OutputStream.Close()
  } catch { }
}
