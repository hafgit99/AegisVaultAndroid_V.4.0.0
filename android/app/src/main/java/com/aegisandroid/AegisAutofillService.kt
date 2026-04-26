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
import java.net.IDN

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
        debugLog("AegisAutofillService instance created")
    }

    companion object {
        private const val TAG = "AegisAutofill"
        // Keep the in-memory autofill session alive long enough for realistic
        // browser/app switching, but still fail closed after prolonged inactivity.
        private const val CACHE_TTL_MS = 15 * 60 * 1000L
        private val cacheLock = Any()
        private var cachedVaultEntries: List<VaultEntry> = emptyList()
        private var cachedUnlocked: Boolean = false
        private var lastUpdatedAtMs: Long = 0L

        private fun debugLog(message: String) {
            if (BuildConfig.DEBUG) {
                android.util.Log.d(TAG, message)
            }
        }

        private fun debugVerbose(message: String) {
            if (BuildConfig.DEBUG) {
                android.util.Log.v(TAG, message)
            }
        }

        private fun debugError(message: String, error: Throwable? = null) {
            if (BuildConfig.DEBUG) {
                android.util.Log.e(TAG, message, error)
            }
        }

        fun updateVaultEntries(entries: List<VaultEntry>) {
            debugLog("Updating vault entries: ${entries.size} items")
            synchronized(cacheLock) {
                cachedVaultEntries = entries
                lastUpdatedAtMs = System.currentTimeMillis()
            }
        }

        fun setUnlocked(unlocked: Boolean) {
            debugLog("Setting vault unlocked: $unlocked")
            synchronized(cacheLock) {
                cachedUnlocked = unlocked
                if (!unlocked) {
                    cachedVaultEntries = emptyList()
                }
                lastUpdatedAtMs = System.currentTimeMillis()
            }
        }

        fun snapshot(): Pair<Boolean, List<VaultEntry>> {
            synchronized(cacheLock) {
                val expired = System.currentTimeMillis() - lastUpdatedAtMs > CACHE_TTL_MS
                if (expired) {
                    cachedUnlocked = false
                    cachedVaultEntries = emptyList()
                }
                return Pair(cachedUnlocked, cachedVaultEntries)
            }
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
        debugLog("Autofill Service Connected")
    }

    override fun onDisconnected() {
        debugLog("Autofill Service Disconnected")
    }

    override fun onFillRequest(
        request: FillRequest,
        cancellationSignal: CancellationSignal,
        callback: FillCallback
    ) {
        debugLog("onFillRequest called, flags=${request.flags}")

        // Chrome uyumluluk modu tespiti (FLAG_COMPATIBILITY_MODE_REQUEST = 0x4)
        val isCompatibilityMode = (request.flags and 0x4) != 0
        debugLog("Compatibility mode: $isCompatibilityMode")

        try {
            val structure = request.fillContexts.lastOrNull()?.structure ?: run {
                debugLog("No structure found")
                callback.onSuccess(null)
                return
            }

            val fields = parseStructure(structure)
            debugLog("Parsed fields: user=${fields.usernameId != null}, pass=${fields.passwordId != null}, domains=${fields.allWebDomains.size}")

            if (fields.usernameId == null && fields.passwordId == null) {
                debugLog("No username or password field found")
                callback.onSuccess(null)
                return
            }

            // Vault kilitliyse → kimlik doğrulama ekranı
            val (isUnlocked, entriesSnapshot) = snapshot()
            if (!isUnlocked) {
                debugLog("Vault is locked, showing auth prompt")
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
            val candidateDomains = collectCandidateDomains(fields.allWebDomains, fields.webDomain)
            debugLog("Candidate domains for matching: ${candidateDomains.joinToString()}")

            val matches = findMatchingEntries(
                targetPackageName,
                candidateDomains,
                entriesSnapshot,
                isUnlocked
            )
            debugLog("Found ${matches.size} matching entries")

            if (matches.isEmpty()) {
                debugLog("No matches found, total entries in memory: ${entriesSnapshot.size}")
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
            debugError("onFillRequest error: ${e.message}", e)
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
        val htmlAttributes = node.htmlInfo?.attributes
            ?.associate { (it.first ?: "").lowercase() to (it.second ?: "").lowercase() }
            ?: emptyMap()
        val htmlId = htmlAttributes["id"] ?: ""
        val htmlName = htmlAttributes["name"] ?: ""
        val htmlType = htmlAttributes["type"] ?: ""
        val htmlAutocomplete = htmlAttributes["autocomplete"] ?: ""
        val htmlPlaceholder = htmlAttributes["placeholder"] ?: ""
        val heuristicId = listOf(idEntry, htmlId, htmlName, htmlAutocomplete)
            .filter { it.isNotBlank() }
            .joinToString(" ")
        val heuristicHint = listOf(hint, htmlType, htmlAutocomplete, htmlPlaceholder)
            .filter { it.isNotBlank() }
            .joinToString(" ")

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
                            debugVerbose("Username via hint: id=$idEntry hint=$hintStr")
                        }
                    }
                    isPasswordHint(hintStr) -> {
                        if (fields.passwordId == null) {
                            fields.passwordId = autofillId
                            debugVerbose("Password via hint: id=$idEntry hint=$hintStr")
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
            if (
                inputType != 0 ||
                heuristicId.isNotEmpty() ||
                heuristicHint.isNotEmpty() ||
                text.isNotEmpty()
            ) {
                if (
                    fields.usernameId == null &&
                    isUsernameField(heuristicId, heuristicHint, text, inputType, className)
                ) {
                    fields.usernameId = autofillId
                    debugVerbose(
                        "Username via heuristic: class=$className id=$heuristicId hint=$heuristicHint inputType=$inputType"
                    )
                }
                if (
                    fields.passwordId == null &&
                    isPasswordField(heuristicId, heuristicHint, text, inputType, className)
                ) {
                    fields.passwordId = autofillId
                    debugVerbose(
                        "Password via heuristic: class=$className id=$heuristicId hint=$heuristicHint inputType=$inputType"
                    )
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
    private fun normalizeDomain(domain: String): String {
        val host = domain.lowercase()
            .removePrefix("https://")
            .removePrefix("http://")
            .removePrefix("www.")
            .substringBefore("/")
            .trim()
            .trim('.')
        return try {
            IDN.toASCII(host).lowercase()
        } catch (_: Exception) {
            host
        }
    }

    private fun collectCandidateDomains(allDomains: List<String>, lastDomain: String): List<String> {
        return (allDomains + listOf(lastDomain))
            .map(::normalizeDomain)
            .filter { it.isNotBlank() }
            .distinct()
            .sortedByDescending { it.length }
    }

    // ── Matching Logic ───────────────────────────────────────────────────────

    private fun findMatchingEntries(
        packageName: String,
        webDomains: List<String>,
        entriesSnapshot: List<VaultEntry>,
        isUnlocked: Boolean
    ): List<VaultEntry> {
        if (!isUnlocked || entriesSnapshot.isEmpty()) return emptyList()

        val domain = webDomains.firstOrNull() ?: ""
        val pkg = packageName.lowercase()

        // Chrome UID'si: com.android.chrome, com.chrome.beta, com.chrome.dev vs.
        val isBrowserRequest = isBrowserPackage(pkg)
        debugLog("isBrowserRequest=$isBrowserRequest for pkg=$pkg")

        return entriesSnapshot
            .filter { entry ->
                // Tüm giriş kayıtlarını dahil et; sadece "login" veya "all" ile sınırlama
                // (kategori boş olanlar, "web", "social" vs. olanlar da dahil edilmeli)
                val cat = entry.category.lowercase()
                cat.isEmpty() || cat == "login" || cat == "all" ||
                cat == "passkey" ||
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
                    isBrowserRequest && webDomains.isNotEmpty() && entryDomain.isNotEmpty() -> {
                        webDomains.any { candidate -> isDomainMatch(entryDomain, candidate) }
                    }
                    // 2. Uygulama paketi bazlı eşleşme (native app)
                    !isBrowserRequest && pkg.isNotEmpty() -> {
                        val pkgLast = pkg.split(".").lastOrNull() ?: ""
                        pkg.contains(entryTitle) ||
                        entryTitle.contains(pkgLast) ||
                        (webDomains.isNotEmpty() && webDomains.any { candidate ->
                            isDomainMatch(entryDomain, candidate)
                        })
                    }
                    // 3. Hem domain hem paket bazlı
                    else -> {
                        val pkgLast = pkg.split(".").lastOrNull() ?: ""
                        (webDomains.isNotEmpty() &&
                            entryDomain.isNotEmpty() &&
                            webDomains.any { candidate ->
                                isDomainMatch(entryDomain, candidate)
                            }) ||
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
                webDomains.maxOfOrNull { candidate ->
                    when {
                        normalizeDomain(entryDomain) == normalizeDomain(candidate) -> 100
                        isDomainMatch(entryDomain, candidate) -> 80
                        else -> 0
                    }
                } ?: 0
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

    private fun isDomainMatch(entryDomainRaw: String, candidateRaw: String): Boolean {
        val entryDomain = normalizeDomain(entryDomainRaw)
        val candidate = normalizeDomain(candidateRaw)
        if (entryDomain.isBlank() || candidate.isBlank()) return false
        if (entryDomain == candidate) return true

        // A saved parent domain may fill a real subdomain, e.g. example.com -> login.example.com.
        // Substring matching is intentionally forbidden to avoid evil-example.com style spoofing.
        return candidate.endsWith(".$entryDomain")
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
        val isPasskey = entry.category.equals("passkey", ignoreCase = true)
        val presentation = RemoteViews(packageName, android.R.layout.simple_list_item_1).apply {
            setTextViewText(
                android.R.id.text1,
                if (isPasskey) "🔐 ${entry.title}" else "🛡️ ${entry.title}"
            )
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
