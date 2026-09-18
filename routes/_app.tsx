import { define } from "../define.ts";

export default define.page(function App({ Component }) {
  return (
    <html lang="en" data-theme="flue">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Flue writer</title>
      </head>
      <body class="min-h-screen bg-base-200 text-base-content">
        <Component />
      </body>
    </html>
  );
});
