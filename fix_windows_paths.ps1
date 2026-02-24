# Windows 10/11 Uzun Dosya Yolu (MAX_PATH) Limitini Kaldırma Scripti
# Bu betiği PowerShell'i Yönetici Olarak Çalıştırarak (Run as Administrator) yürütünüz.

Write-Host "Windows MAX_PATH (260 karakter) limiti kaldiriliyor..." -ForegroundColor Cyan

try {
    # Kayıt defteri anahtarını güncelle (LongPathsEnabled = 1)
    Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -ErrorAction Stop
    Write-Host "[BASSARILI] Windows Uzun Dosya Yolu limiti basariyla kaldirildi!" -ForegroundColor Green
    Write-Host "AegisAndroid projenizi simdi 'npx react-native run-android' komutuyla sorunsuz derleyebilirsiniz." -ForegroundColor Yellow
} catch {
    Write-Host "[HATA] Lutfen PowerShell'i YONETICI (Administrator) olarak baslatip bu scripti tekrar calistirin." -ForegroundColor Red
}
