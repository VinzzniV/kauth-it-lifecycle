param([int]$Port, [string]$Workspace)
$ErrorActionPreference='Stop'
$listener=[Net.HttpListener]::new();$listener.Prefixes.Add("http://127.0.0.1:$Port/");$listener.Start()
try {
    while($listener.IsListening){
        $context=$listener.GetContext()
        try {
            if($context.Request.Headers['Authorization'] -cne 'Bearer isolated-test-token'){$context.Response.StatusCode=401;continue}
            if(-not(Test-Path (Join-Path $Workspace 'allow-import'))){$context.Response.StatusCode=503;continue}
            $reader=[IO.StreamReader]::new($context.Request.InputStream,[Text.Encoding]::UTF8)
            try{$body=$reader.ReadToEnd();$result=$body|ConvertFrom-Json}finally{$reader.Dispose()}
            $body|Set-Content -LiteralPath (Join-Path $Workspace ($result.jobId+'.received.json')) -Encoding UTF8
            $context.Response.StatusCode=200
        } finally {$context.Response.Close()}
    }
}finally{$listener.Stop();$listener.Close()}
