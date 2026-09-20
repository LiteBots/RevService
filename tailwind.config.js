module.exports = {
            content: ['./Public/**/*.html', './Public/assets/*.js'],
            theme: {
                extend: {
                    colors: {
                        brand: {
                            400: '#34d399',
                            500: '#10b981',
                            600: '#059669',
                            700: '#047857',
                        },
                        dark: {
                            900: '#030303',
                            800: '#0a0a0a',
                            700: '#121212',
                            600: '#1a1a1a',
                        }
                    },
                    fontFamily: {
                        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
                    },
                    backgroundImage: {
                        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
                    },
                    animation: {
                        'float': 'float 6s ease-in-out infinite',
                        'float-delayed': 'float 6s ease-in-out 3s infinite',
                        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                        'scanline': 'scanline 8s linear infinite',
                    },
                    keyframes: {
                        float: {
                            '0%, 100%': { transform: 'translateY(0)' },
                            '50%': { transform: 'translateY(-15px)' },
                        },
                        scanline: {
                            '0%': { transform: 'translateY(-100%)' },
                            '100%': { transform: 'translateY(100%)' },
                        }
                    }
                }
            }
        };
