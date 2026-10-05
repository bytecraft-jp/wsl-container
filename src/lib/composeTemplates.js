// compose ファイルのテンプレート
export const COMPOSE_TEMPLATES = [
  {
    id: 'blank',
    title: '空のプロジェクト',
    yaml: `services:
  app:
    image: alpine:latest
    command: sleep infinity
`,
  },
  {
    id: 'nginx',
    title: 'Web サーバー (nginx)',
    yaml: `services:
  web:
    image: nginx:alpine
    ports:
      - "8080:80"
    volumes:
      - ./html:/usr/share/nginx/html:ro
`,
  },
  {
    id: 'postgres',
    title: 'PostgreSQL + Adminer',
    yaml: `services:
  db:
    image: postgres:17
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: app
    volumes:
      - dbdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 5s
      retries: 10
  adminer:
    image: adminer:latest
    ports:
      - "8081:8080"
    depends_on:
      db:
        condition: service_healthy

volumes:
  dbdata:
`,
  },
  {
    id: 'wordpress',
    title: 'WordPress + MariaDB',
    yaml: `services:
  db:
    image: mariadb:11
    environment:
      MARIADB_ROOT_PASSWORD: rootpass
      MARIADB_DATABASE: wordpress
      MARIADB_USER: wp
      MARIADB_PASSWORD: wppass
    volumes:
      - db:/var/lib/mysql
  wordpress:
    image: wordpress:latest
    ports:
      - "8082:80"
    environment:
      WORDPRESS_DB_HOST: db
      WORDPRESS_DB_USER: wp
      WORDPRESS_DB_PASSWORD: wppass
      WORDPRESS_DB_NAME: wordpress
    depends_on:
      - db

volumes:
  db:
`,
  },
  {
    id: 'gui',
    title: 'GUI アプリ (Firefox)',
    yaml: `services:
  firefox:
    image: jlesage/firefox:latest
    ports:
      - "127.0.0.1:5800:5800"
    environment:
      TZ: Asia/Tokyo
      ENABLE_CJK_FONT: "1"
    shm_size: 2g
    volumes:
      - firefox-config:/config
    # WSL Container Studio 拡張: GUI ビューアーで開くポート
    x-wcs-gui:
      port: 5800

volumes:
  firefox-config:
`,
  },
];
