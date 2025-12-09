/** @type {import('tailwindcss').Config} */
export default {
    content: ['./src/**/*.{html,js,svelte,ts}'],
    theme: {
        extend: {
            colors: {
                // Mapping our custom vars if needed, or just relying on utility classes
                // We can extend theme here to match the design system in app.css if we want
            }
        },
    },
    plugins: [],
}
