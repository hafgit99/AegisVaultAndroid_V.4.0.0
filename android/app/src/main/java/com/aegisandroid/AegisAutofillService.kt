package com.aegisandroid

import android.app.assist.AssistStructure
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.os.CancellationSignal
import android.service.autofill.*
import android.text.InputType
import android.view.autofill.AutofillId
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import android.annotation.SuppressLint
import androidx.annotation.RequiresApi

/**
 * Aegis Vault – Android Autofill Service
 *
 * Integrates with Android's Autofill Framework (API 26+) to provide
 * password auto-fill suggestions from the encrypted vault.
 *
 * Chrome/Chromium Compatibility Notes:
 * - Chrome runs in "compatibility mode" for autofill (FLAG_COMPATIBILITY_MODE_REQUEST).
 *   In this mode, autofillHints are rarely populated; we must use inputType + heuristics.
 * - webDomain is only set on specific WebView nodes; we collect ALL non-empty domains
 *   from the entire view tree (depth-first) and pick the best one.
 * - inputType must be masked with TYPE_MASK_VARIATION before comparison.
 * - Inline suggestions (keyboard) require supportsInlineSuggestions in the XML config.
 *
 * Aloha / Gecko-based browsers use standard autofillHints, so they work out of the box.
 */
@RequiresApi(Build.VERSION_CODES.O)
class AegisAutofillService : AutofillService() {

    init {
        android.util.Log.d(TAG, "AegisAutofillService instance created")
    }

    companion object {
        private const val TAG = "AegisAutofill"

        @Volatile
        var vaultEntries: List<VaultEntry> = emptyList()

        @Volatile
        var isVaultUnlocked: Boolean = false

        fun updateVaultEntries(entries: List<VaultEntry>) {
            android.util.Log.d(TAG, "Updating vault entries: ${entries.size} items")
            vaultEntries = entries
        }

        fun setUnlocked(unlocked: Boolean) {
            android.util.Log.d(TAG, "Setting vault unlocked: $unlocked")
            isVaultUnlocked = unlocked
        }
    }

    data class VaultEntry(
        val id: Int,
        val title: String,
        val username: String,
        val password: String,
        val url: String,
        val category: String
    )

    override fun onConnected() {
        android.util.Log.d(TAG, "Autofill Service Connected")
    }

    override fun onDisconnected() {
        android.util.Log.d(TAG, "Autofill Service Disconnected")
    }

    override fun onFillRequest(
        request: FillRequest,
        cancellationSignal: CancellationSignal,
        callback: FillCallback
    ) {
        android.util.Log.d(TAG, "onFillRequest called, flags=${request.flags}")

        // Chrome uyumluluk modu tespiti (FLAG_COMPATIBILITY_MODE_REQUEST = 0x4)
        val isCompatibilityMode = (request.flags and 0x4) != 0
        android.util.Log.d(TAG, "Compatibility mode: $isCompatibilityMode")

        try {
            val structure = request.fillContexts.lastOrNull()?.structure ?: run {
                android.util.Log.d(TAG, "No structure found")
                callback.onSuccess(null)
                return
            }

            val fields = parseStructure(structure)
            android.util.Log.d(
                TAG,
                "Parsed fields: user=${fields.usernameId}, pass=${fields.passwordId}, " +
                "domain='${fields.webDomain}', allDomains=${fields.allWebDomains}"
            )

            if (fields.usernameId == null && fields.passwordId == null) {
                android.util.Log.d(TAG, "No username or password field found")
                callback.onSuccess(null)
                return
            }

            // Vault kilitliyse → kimlik doğrulama ekranı
            if (!isVaultUnlocked) {
                android.util.Log.d(TAG, "Vault is locked, showing auth prompt")
                val responseBuilder = FillResponse.Builder()
                val authPresentation = RemoteViews(this@AegisAutofillService.packageName, android.R.layout.simple_list_item_1).apply {
                    setTextViewText(android.R.id.text1, getString(R.string.autofill_unlock_prompt))
                }
                val intent = packageManager.getLaunchIntentForPackage(packageName)
                    ?: Intent(this, Class.forName("com.aegisandroid.MainActivity"))
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                val pendingIntent = PendingIntent.getActivity(
                    this, 0, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                responseBuilder.setAuthentication(
                    listOfNotNull(fields.usernameId, fields.passwordId).toTypedArray(),
                    pendingIntent.intentSender,
                    authPresentation
                )
                callback.onSuccess(responseBuilder.build())
                return
            }

            val targetPackageName = structure.activityComponent?.packageName ?: ""

            // Chrome'da asıl web domain'i bulmak için tüm toplanan domain'lerden
            // en iyi eşleşeni seçiyoruz
            val bestDomain = chooseBestDomain(fields.allWebDomains, fields.webDomain)
            android.util.Log.d(TAG, "Best domain selected: '$bestDomain' from ${fields.allWebDomains}")

            val matches = findMatchingEntries(targetPackageName, bestDomain)
            android.util.Log.d(TAG, "Found ${matches.size} matches for pkg=$targetPackageName, domain=$bestDomain")

            if (matches.isEmpty()) {
                android.util.Log.d(TAG, "No matches found, total entries in memory: ${vaultEntries.size}")
                // Boş yanıt yerine null döndür; Chrome'da gereksiz "kayıt bulunamadı" overlay'ini önler
                callback.onSuccess(null)
                return
            }

            val responseBuilder = FillResponse.Builder()

            for (entry in matches.take(5)) {
                val dataset = buildDataset(entry, fields)
                if (dataset != null) {
                    responseBuilder.addDataset(dataset)
                }
            }

            callback.onSuccess(responseBuilder.build())
        } catch (e: Exception) {
            android.util.Log.e(TAG, "onFillRequest error: ${e.message}", e)
            callback.onSuccess(null)
        }
    }

    override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
        callback.onSuccess()
    }

    // ── Structure Parser ─────────────────────────────────────────────────────

    data class ParsedFields(
        var usernameId: AutofillId? = null,
        var passwordId: AutofillId? = null,
        var webDomain: String = "",
        val allWebDomains: MutableList<String> = mutableListOf()
    )

    private fun parseStructure(structure: AssistStructure): ParsedFields {
        val fields = ParsedFields()
        for (i in 0 until structure.windowNodeCount) {
            val windowNode = structure.getWindowNodeAt(i)
            parseNode(windowNode.rootViewNode, fields)
        }
        return fields
    }

    private fun parseNode(node: AssistStructure.ViewNode, fields: ParsedFields) {
        val className = node.className ?: ""
        val idEntry = node.idEntry?.lowercase() ?: ""
        val hint = node.hint?.lowercase() ?: ""
        val text = node.text?.toString()?.lowercase() ?: ""
        val autofillHints = node.autofillHints
        val domain = node.webDomain

        // Tüm web domain'lerini topla (Chrome'da farklı node'larda dağınık olabilir)
        if (!domain.isNullOrEmpty()) {
            fields.webDomain = domain  // en son bulunanı tut (genellikle en spesifik)
            if (!fields.allWebDomains.contains(domain)) {
                fields.allWebDomains.add(domain)
            }
        }

        val autofillId = node.autofillId

        // 1. Öncelik: Explicit autofillHints (Aloha, Firefox vs. burayı kullanır)
        if (autofillId != null && !autofillHints.isNullOrEmpty()) {
            for (hintStr in autofillHints) {
                when {
                    isUsernameHint(hintStr) -> {
                        if (fields.usernameId == null) {
                            fields.usernameId = autofillId
                            android.util.Log.v(TAG, "Username via hint: id=$idEntry hint=$hintStr")
                        }
                    }
                    isPasswordHint(hintStr) -> {
                        if (fields.passwordId == null) {
                            fields.passwordId = autofillId
                            android.util.Log.v(TAG, "Password via hint: id=$idEntry hint=$hintStr")
                        }
                    }
                }
            }
        }

        // 2. Öncelik: inputType + id/hint heuristics
        // (Chrome uyumluluk modunda autofillHints çoğunlukla boş gelir)
        if (autofillId != null) {
            val inputType = node.inputType

            // inputType = 0 olan view'lar genellikle container'dır, atla
            if (inputType != 0 || idEntry.isNotEmpty() || hint.isNotEmpty()) {
                if (fields.usernameId == null && isUsernameField(idEntry, hint, text, inputType, className)) {
                    fields.usernameId = autofillId
                    android.util.Log.v(TAG, "Username via heuristic: class=$className id=$idEntry hint=$hint inputType=$inputType")
                }
                if (fields.passwordId == null && isPasswordField(idEntry, hint, text, inputType, className)) {
                    fields.passwordId = autofillId
                    android.util.Log.v(TAG, "Password via heuristic: class=$className id=$idEntry hint=$hint inputType=$inputType")
                }
            }
        }

        for (i in 0 until node.childCount) {
            parseNode(node.getChildAt(i), fields)
        }
    }

    // ── Hint Detectors ───────────────────────────────────────────────────────

    @SuppressLint("InlinedApi")
    private fun isUsernameHint(hint: String): Boolean {
        val lower = hint.lowercase()
        return lower == android.view.View.AUTOFILL_HINT_USERNAME ||
               lower == android.view.View.AUTOFILL_HINT_EMAIL_ADDRESS ||
               lower.contains("username") ||
               lower.contains("email") ||
               lower.contains("phone") ||
               lower.contains("login")
    }

    @SuppressLint("InlinedApi")
    private fun isPasswordHint(hint: String): Boolean {
        val lower = hint.lowercase()
        return lower == android.view.View.AUTOFILL_HINT_PASSWORD ||
               lower == "newpassword" ||  // View.AUTOFILL_HINT_NEW_PASSWORD (API 30+)
               lower.contains("password") ||
               lower.contains("passwd") ||
               lower.contains("pwd")
    }

    // ── Field Type Heuristics (Chrome Compat) ────────────────────────────────

    private fun isUsernameField(
        idEntry: String,
        hint: String,
        text: String,
        inputType: Int,
        className: String
    ): Boolean {
        val usernameKeywords = listOf("user", "email", "login", "account", "name", "mail", "phone", "id")

        // id veya hint ile eşleşme
        if (usernameKeywords.any { idEntry.contains(it) || hint.contains(it) }) return true

        // inputType kontrolü — TYPE_MASK_VARIATION ile doğru maskeleme
        // (Chrome'da tipik email alanı: TYPE_CLASS_TEXT | TYPE_TEXT_VARIATION_EMAIL_ADDRESS = 0x21)
        val variation = inputType and InputType.TYPE_MASK_VARIATION
        val textClass = inputType and InputType.TYPE_MASK_CLASS

        if (textClass == InputType.TYPE_CLASS_TEXT) {
            if (variation == InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS ||
                variation == InputType.TYPE_TEXT_VARIATION_WEB_EMAIL_ADDRESS) {
                return true
            }
            // Bazı Chrome versiyonlarında username field'i NORMAL text olarak gelir
            // ancak id/hint'e göre tespit edilebilir (yukarıda kapsandı)
        }

        // Tel numarası alanı
        if (inputType and InputType.TYPE_MASK_CLASS == InputType.TYPE_CLASS_PHONE) return true

        return false
    }

    private fun isPasswordField(
        idEntry: String,
        hint: String,
        text: String,
        inputType: Int,
        className: String
    ): Boolean {
        val passwordKeywords = listOf("pass", "pwd", "secret", "password", "pswd", "senha", "parola")

        if (passwordKeywords.any { idEntry.contains(it) || hint.contains(it) }) return true

        // inputType maskesi — CRITICAL: TYPE_MASK_VARIATION olmadan Chrome'da yanlış çalışır
        val variation = inputType and InputType.TYPE_MASK_VARIATION
        val textClass = inputType and InputType.TYPE_MASK_CLASS

        if (textClass == InputType.TYPE_CLASS_TEXT) {
            return variation == InputType.TYPE_TEXT_VARIATION_PASSWORD ||
                   variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD ||
                   variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
        }

        return false
    }

    // ── Domain Seçici ────────────────────────────────────────────────────────

    /**
     * Chrome'da birden fazla domain geldiğinde (ana frame + iframe'ler),
     * en uzun ve en anlamlı domain'i seçiyoruz.
     * Örn: ["google.com", "accounts.google.com"] → "accounts.google.com"
     */
    private fun chooseBestDomain(allDomains: List<String>, lastDomain: String): String {
        if (allDomains.isEmpty()) return lastDomain
        if (allDomains.size == 1) return allDomains[0]

        // En uzunu seç (genellikle en spesifik subdomain)
        return allDomains.maxByOrNull { it.length } ?: lastDomain
    }

    // ── Matching Logic ───────────────────────────────────────────────────────

    private fun findMatchingEntries(packageName: String, webDomain: String): List<VaultEntry> {
        if (!isVaultUnlocked || vaultEntries.isEmpty()) return emptyList()

        val domain = webDomain.lowercase()
            .removePrefix("www.")
            .trim()
        val pkg = packageName.lowercase()

        // Chrome UID'si: com.android.chrome, com.chrome.beta, com.chrome.dev vs.
        val isBrowserRequest = isBrowserPackage(pkg)
        android.util.Log.d(TAG, "isBrowserRequest=$isBrowserRequest for pkg=$pkg")

        return vaultEntries
            .filter { entry ->
                // Tüm giriş kayıtlarını dahil et; sadece "login" veya "all" ile sınırlama
                // (kategori boş olanlar, "web", "social" vs. olanlar da dahil edilmeli)
                val cat = entry.category.lowercase()
                cat.isEmpty() || cat == "login" || cat == "all" ||
                cat == "web" || cat == "social" || cat == "banking" ||
                cat == "email" || cat == "shopping" || cat == "other"
                // Not: Sadece "note" gibi şifre içermeyen kategoriler hariç tutulabilir
                // ama burada hepsini dahil etmek daha güvenli
            }
            .filter { entry ->
                val entryDomain = entry.url.lowercase()
                    .removePrefix("https://")
                    .removePrefix("http://")
                    .removePrefix("www.")
                    .split("/").firstOrNull()?.trim() ?: ""
                val entryTitle = entry.title.lowercase()

                when {
                    // 1. Domain bazlı eşleşme (tarayıcı istekleri için birincil yöntem)
                    isBrowserRequest && domain.isNotEmpty() && entryDomain.isNotEmpty() -> {
                        entryDomain.contains(domain) ||
                        domain.contains(entryDomain) ||
                        entryTitle.contains(extractMainDomain(domain)) ||
                        extractMainDomain(entryDomain).contains(extractMainDomain(domain))
                    }
                    // 2. Uygulama paketi bazlı eşleşme (native app)
                    !isBrowserRequest && pkg.isNotEmpty() -> {
                        val pkgLast = pkg.split(".").lastOrNull() ?: ""
                        pkg.contains(entryTitle) ||
                        entryTitle.contains(pkgLast) ||
                        (domain.isNotEmpty() && (
                            entryDomain.contains(domain) || domain.contains(entryDomain)
                        ))
                    }
                    // 3. Hem domain hem paket bazlı
                    else -> {
                        val pkgLast = pkg.split(".").lastOrNull() ?: ""
                        (domain.isNotEmpty() && entryDomain.isNotEmpty() && (
                            entryDomain.contains(domain) || domain.contains(entryDomain)
                        )) ||
                        (pkg.isNotEmpty() && (
                            pkg.contains(entryTitle) || entryTitle.contains(pkgLast)
                        ))
                    }
                }
            }
            .sortedByDescending { entry ->
                val entryDomain = entry.url.lowercase()
                    .removePrefix("https://")
                    .removePrefix("http://")
                    .removePrefix("www.")
                    .split("/").firstOrNull() ?: ""
                when {
                    entryDomain == domain -> 100
                    entryDomain.contains(domain) && domain.isNotEmpty() -> 80
                    domain.contains(entryDomain) && entryDomain.isNotEmpty() -> 60
                    else -> 0
                }
            }
    }

    /**
     * "accounts.google.com" → "google"
     * "github.com" → "github"
     */
    private fun extractMainDomain(domain: String): String {
        val parts = domain.split(".")
        return if (parts.size >= 2) parts[parts.size - 2] else domain
    }

    /**
     * Chrome ve diğer tarayıcı paket adlarını tespit et.
     * Bu paketlerde domain bazlı eşleşme kullanılır, paket bazlı değil.
     */
    private fun isBrowserPackage(pkg: String): Boolean {
        val browserPackages = listOf(
            "com.android.chrome",
            "com.chrome",
            "org.chromium",
            "com.brave",
            "com.microsoft.emmx",        // Edge
            "com.opera",
            "com.sec.android.app.sbrowser", // Samsung Internet
            "org.mozilla",               // Firefox, Fennec
            "com.mozilla",
            "com.vivaldi",
            "com.duckduckgo",
            "com.yandex.browser",
            "com.kiwibrowser",
            "com.alohamobile.browser"    // Aloha
        )
        return browserPackages.any { pkg.startsWith(it) }
    }

    // ── Dataset Builder ──────────────────────────────────────────────────────

    private fun buildDataset(entry: VaultEntry, fields: ParsedFields): Dataset? {
        val presentation = RemoteViews(packageName, android.R.layout.simple_list_item_1).apply {
            setTextViewText(android.R.id.text1, "🛡️ ${entry.title}")
        }

        val datasetBuilder = Dataset.Builder(presentation)
        var hasFields = false

        // Kullanıcı adı alanını doldur
        if (fields.usernameId != null && entry.username.isNotEmpty()) {
            datasetBuilder.setValue(
                fields.usernameId!!,
                AutofillValue.forText(entry.username)
            )
            hasFields = true
        }

        // Parola alanını doldur
        if (fields.passwordId != null && entry.password.isNotEmpty()) {
            datasetBuilder.setValue(
                fields.passwordId!!,
                AutofillValue.forText(entry.password)
            )
            hasFields = true
        }

        // Sadece şifre alanı varsa (username alanı yoksa) yine de döndür
        return if (hasFields) datasetBuilder.build() else null
    }
}
