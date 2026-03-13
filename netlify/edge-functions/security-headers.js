export default async (request, context) => {
  const response = await context.next();
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://plausible.io https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; frame-src https://checkout.stripe.com https://open.spotify.com; media-src 'self' https://api.riverside.fm https://hosting-media.rs-prod.riverside.fm; connect-src 'self' https://plausible.io https://checkout.stripe.com https://api.stripe.com; object-src 'none'; base-uri 'self'; form-action 'self' https://buttondown.com https://checkout.stripe.com"
  );
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()"
  );
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );
  return response;
};

export const config = { path: "/*" };
