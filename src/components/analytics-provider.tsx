'use client';

import Script from 'next/script';
import { useEffect } from 'react';
import { publicEnv } from '@/lib/env';
import { captureAttribution, track } from '@/lib/analytics';

/**
 * Inicializa a atribuição e carrega os pixels configurados.
 *
 * Nenhum pixel é obrigatório: sem os IDs no ambiente, nada é carregado e o
 * funil interno continua completo.
 */
export function AnalyticsProvider() {
  useEffect(() => {
    captureAttribution();
    if (window.location.pathname === '/') {
      track('landing_view');
    }
  }, []);

  return (
    <>
      {publicEnv.metaPixelId ? (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${publicEnv.metaPixelId}');fbq('track','PageView');`}
        </Script>
      ) : null}

      {publicEnv.gaMeasurementId ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${publicEnv.gaMeasurementId}`}
            strategy="afterInteractive"
          />
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}
gtag('js',new Date());gtag('config','${publicEnv.gaMeasurementId}');`}
          </Script>
        </>
      ) : null}

      {publicEnv.tiktokPixelId ? (
        <Script id="tiktok-pixel" strategy="afterInteractive">
          {`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";
ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=r;ttq._t=ttq._t||{};ttq._t[e]=+new Date;
ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=d.createElement("script");o.type="text/javascript";
o.async=!0;o.src=r+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];
a.parentNode.insertBefore(o,a)};ttq.load('${publicEnv.tiktokPixelId}');ttq.page()}(window,document,'ttq');`}
        </Script>
      ) : null}
    </>
  );
}
