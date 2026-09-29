# NIKA — interactive portfolio

An editorial still life of eight handmade jars. Each jar holds one blueberry and one demo project.

## Run

```bash
npm install
npm run dev
```

Open the printed local URL. The development command watches source files and rebuilds on changes; refresh the browser to see them. For a production build, run `npm run build`; `npm run preview` serves the built site. `npm run dev:vite` is also available where Vite's dependency optimizer has unrestricted filesystem access.

## Deploy to GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds the site and deploys it to GitHub Pages whenever you push to `main` or `master`. It also supports a manual run from the repository's **Actions** tab. Vite gets its base path from GitHub Pages, so project URLs, `username.github.io` sites, and custom domains use the correct asset paths.

1. Push this project to a GitHub repository.
2. In the repository, open **Settings → Pages** and select **GitHub Actions** under **Build and deployment → Source**.
3. Push to `main` or `master`, or run **Deploy to GitHub Pages** manually from **Actions**.
4. When the workflow succeeds, open the published URL shown in its `deploy` job or on **Settings → Pages**.

For a custom domain, configure it in **Settings → Pages** and add the matching DNS records at your domain provider.

## Interactions

- Click or tap a jar to open its project through the blueberry transition.
- Press and hold a jar for about 390 ms, then move across it to erase only the internal light. The light returns spatially after release or after five seconds.
- Click **NIKA** or **ABOUT / CV** to open the CV panel.
- Keyboard: Tab to a jar and press Enter or Space. Escape closes an open project or CV panel.

## Replace demo content

- `src/data.ts`: project titles, years, types, descriptions, images, and jar placement/appearance.
- `public/projects/`: replace the four abstract SVG studies with real project images and update image paths in `src/data.ts`.
- `src/components/Jar.tsx`: procedural jar silhouettes, fabric patterns, blueberry, particles and label. The eight jar configurations are intentionally distinct. Image-based jar art can be introduced in this component while retaining the interaction logic.
- `public/jars/`, `public/fabrics/`, `public/blueberries/`, `public/fonts/`: reserved locations for future art assets.
- `src/components/CVPanel.tsx`: replace the placeholder biography, experience, email and social labels. No social destination is asserted yet.

The site uses React, TypeScript and Vite. Motion is implemented with CSS transforms and a small amount of `requestAnimationFrame`; reduced-motion and touch preferences are respected.
