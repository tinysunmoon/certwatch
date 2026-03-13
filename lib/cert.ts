import * as tls from 'tls';

export async function getCertExpiry(domain: string): Promise<{ expiryDate: Date; daysRemaining: number } | null> {
  return new Promise((resolve) => {
    const socket = tls.connect(443, domain, { servername: domain, rejectUnauthorized: false }, () => {
      const cert = socket.getPeerCertificate();
      socket.destroy();

      if (!cert || !cert.valid_to) {
        resolve(null);
        return;
      }

      const expiryDate = new Date(cert.valid_to);
      const now = new Date();
      const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      resolve({ expiryDate, daysRemaining });
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(null);
    });

    socket.setTimeout(10000, () => {
      socket.destroy();
      resolve(null);
    });
  });
}
