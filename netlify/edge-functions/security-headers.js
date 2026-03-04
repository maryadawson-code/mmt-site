export default async (request, context) => {
  const response = await context.next();
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' https://plausible.io; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; frame-src https://checkout.stripe.com; connect-src 'self' https://plausible.io https://checkout.stripe.com; object-src 'none'; base-uri 'self'; form-action 'self' https://buttondown.com https://checkout.stripe.com"
  );
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()"
  );
  return response;
};

export const config = { path: "/*" };
