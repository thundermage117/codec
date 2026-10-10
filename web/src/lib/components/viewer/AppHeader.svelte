<script lang="ts">
    let isDarkTheme = $state(
        typeof document !== 'undefined' &&
        document.documentElement.getAttribute('data-theme') === 'dark'
    );

    function toggleTheme() {
        if (isDarkTheme) {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
        }
        isDarkTheme = !isDarkTheme;
    }
</script>

<header>
    <h1>Codec Explorer</h1>
    <div class="header-badges">
        <span class="privacy-note" title="Everything runs in your browser via WebAssembly; images never leave your device.">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            Runs locally
        </span>
        <a href="https://github.com/thundermage117/codec" class="github-link" target="_blank" rel="noopener noreferrer"
            aria-label="Source on GitHub" title="Source on GitHub">
            <img src="/assets/GitHub_Invertocat_Black.svg" alt="" width="16" height="16">
        </a>
        <button class="theme-toggle" id="themeToggle" aria-label="Toggle dark mode" onclick={toggleTheme}>
            <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"
                style={isDarkTheme ? 'display:none' : 'display:block'}>
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
            <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"
                style={isDarkTheme ? 'display:block' : 'display:none'}>
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
        </button>
    </div>
</header>
