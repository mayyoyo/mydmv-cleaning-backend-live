(function () {
    "use strict";

    // ==============================
    // CREATE NAVIGATION
    // ==============================

    const navigation = document.createElement("div");

    navigation.className = "site-bottom-navigation";

    navigation.innerHTML = `
        <div class="site-bottom-navigation-inner">

            <a href="/" class="site-nav-home">
                <span class="site-nav-icon">⌂</span>
                <span>Home</span>
            </a>

            <button
                type="button"
                class="site-nav-top"
                onclick="window.scrollTo({ top: 0, behavior: 'smooth' })"
            >
                <span class="site-nav-icon">↑</span>
                <span>Back to Top</span>
            </button>

        </div>
    `;

    document.body.appendChild(navigation);

    // ==============================
    // ADD STYLES
    // ==============================

    const style = document.createElement("style");

    style.textContent = `
        .site-bottom-navigation {
            width: 100%;
            padding: 18px 20px 25px;
            box-sizing: border-box;
            text-align: center;
        }

        .site-bottom-navigation-inner {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 12px;
            flex-wrap: wrap;
            max-width: 1200px;
            margin: 0 auto;
        }

        .site-bottom-navigation a,
        .site-bottom-navigation button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;

            padding: 11px 18px;

            border-radius: 999px;

            border: 1px solid rgba(128, 128, 128, 0.35);

            background: rgba(255, 255, 255, 0.08);

            color: inherit;

            text-decoration: none;

            font-family: inherit;
            font-size: 14px;
            font-weight: 600;

            cursor: pointer;

            transition:
                transform 0.2s ease,
                background 0.2s ease,
                box-shadow 0.2s ease;
        }

        .site-bottom-navigation a:hover,
        .site-bottom-navigation button:hover {
            transform: translateY(-2px);

            background: rgba(255, 255, 255, 0.16);

            box-shadow:
                0 6px 18px rgba(0, 0, 0, 0.12);
        }

        .site-nav-icon {
            font-size: 18px;
            line-height: 1;
        }

        @media (max-width: 600px) {

            .site-bottom-navigation {
                padding: 15px 15px 22px;
            }

            .site-bottom-navigation-inner {
                gap: 8px;
            }

            .site-bottom-navigation a,
            .site-bottom-navigation button {
                padding: 10px 14px;
                font-size: 13px;
            }

        }
    `;

    document.head.appendChild(style);

})();
