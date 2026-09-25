# TRIỂN KHAI GITA AI V50 LÊN CLOUDFLARE

## 1. Đưa source lên GitHub
Giải nén ZIP, tạo repository mới, commit toàn bộ source. Không commit `.dev.vars` hoặc token.

## 2. Tạo tài nguyên Cloudflare
```bash
npm install
npx wrangler login
npx wrangler d1 create gita-ai-v50
npx wrangler r2 bucket create gita-ai-v50-media
npx wrangler queues create gita-ai-v50-render
npx wrangler queues create gita-ai-v50-render-dlq
```
Dán `database_id` D1 vào `wrangler.jsonc`.

## 3. Secret
```bash
npx wrangler secret put OWNER_API_KEY
npx wrangler secret put RENDER_API_TOKEN
```
Nếu có GPU provider, đặt `RENDER_API_URL` bằng biến môi trường/vars phù hợp. Không ghi token vào Git.

## 4. Database và kiểm tra
```bash
npm run db:migrate:remote
npm run check
npm run deploy
```

## 5. GitHub Actions
Tạo GitHub repository secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Workflow sẽ type-check trước khi deploy.

## 6. Production gate
Web/control plane có thể chạy hoàn toàn trên Cloudflare. Video GPU 30 phút không được giả lập trong Worker. Khi chưa có `RENDER_API_URL`, production dừng ở `blocked_provider`. Khi provider hoàn tất, nó phải upload artifact thật vào R2 rồi callback; V50 kiểm tra R2 trước khi đánh dấu COMPLETE.
