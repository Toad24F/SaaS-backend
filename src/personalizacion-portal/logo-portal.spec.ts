import sharp from 'sharp';
import { sanearLogoPortal } from './logo-portal';

const limite = 2 * 1024 * 1024;

function imagen(ancho = 12, alto = 8) {
  return sharp({ create: { width: ancho, height: alto, channels: 4, background: '#33669980' } });
}

describe('Saneado de logos del portal', () => {
  it.each(['png', 'jpeg', 'webp'] as const)('decodifica %s estático y devuelve WebP', async (formato) => {
    const archivo = await imagen().toFormat(formato).toBuffer();
    const salida = await sanearLogoPortal(archivo, `image/${formato}`);
    expect(salida).toMatchObject({ mime: 'image/webp', ancho: 12, alto: 8 });
    expect(await sharp(salida.contenido).metadata()).toMatchObject({ format: 'webp', width: 12, height: 8 });
  });

  it('rechaza MIME falso y SVG aunque se declare PNG', async () => {
    const png = await imagen().png().toBuffer();
    await expect(sanearLogoPortal(png, 'image/jpeg')).rejects.toThrow('formato');
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="8"/>');
    await expect(sanearLogoPortal(svg, 'image/png')).rejects.toThrow('formato');
  });

  it('rechaza WebP animado y PNG con control de animación', async () => {
    const pixeles = Buffer.alloc(12, 255);
    pixeles[6] = 0;
    const webp = await sharp(pixeles, { raw: { width: 2, height: 2, channels: 3, pageHeight: 1 } })
      .webp({ delay: [100, 100] }).toBuffer();
    expect((await sharp(webp).metadata()).pages).toBe(2);
    await expect(sanearLogoPortal(webp, 'image/webp')).rejects.toThrow('animación');

    // acTL es el bloque de control que distingue APNG de un PNG estático.
    const png = await imagen().png().toBuffer();
    const control = Buffer.from('000000086163544c0000000200000000f38d9370', 'hex');
    const apng = Buffer.concat([png.subarray(0, 33), control, png.subarray(33)]);
    await expect(sanearLogoPortal(apng, 'image/png')).rejects.toThrow('animación');
  });

  it('aplica el límite inclusivo de entrada y el límite por dimensión', async () => {
    const png = await imagen(2048, 8).png().toBuffer();
    const exacto = Buffer.concat([png, Buffer.alloc(limite - png.length)]);
    await expect(sanearLogoPortal(exacto, 'image/png')).resolves.toMatchObject({ ancho: 2048 });
    await expect(sanearLogoPortal(Buffer.concat([exacto, Buffer.alloc(1)]), 'image/png')).rejects.toThrow('2 MiB');
    const anchoExcesivo = await imagen(2049, 1).png().toBuffer();
    await expect(sanearLogoPortal(anchoExcesivo, 'image/png')).rejects.toThrow('2048');
  });

  it('rechaza PNG sin cierre y JPEG con datos comprimidos truncados', async () => {
    const png = await imagen().png().toBuffer();
    await expect(sanearLogoPortal(png.subarray(0, -12), 'image/png')).rejects.toThrow('decodificar');
    const jpeg = await imagen(32, 16).jpeg().toBuffer();
    await expect(sanearLogoPortal(jpeg.subarray(0, -15), 'image/jpeg')).rejects.toThrow('decodificar');
  });

  it('elimina metadatos y bytes anexos y aplica la orientación visual', async () => {
    const marca = 'marca de metadatos de prueba';
    const jpeg = await imagen().withMetadata({ orientation: 6 })
      .withExifMerge({ IFD0: { ImageDescription: marca } }).jpeg().toBuffer();
    expect(jpeg.includes(marca)).toBe(true);
    const salida = await sanearLogoPortal(Buffer.concat([jpeg, Buffer.from(marca)]), 'image/jpeg');
    const metadata = await sharp(salida.contenido).metadata();
    expect(salida).toMatchObject({ ancho: 8, alto: 12 });
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(salida.contenido.includes(marca)).toBe(false);
  });

  it('rechaza el raster recodificado cuando supera 2 MiB', async () => {
    // Un JPEG pequeño puede expandirse al recodificar sus píxeles sin pérdida.
    const lado = 1536;
    const pixeles = Buffer.alloc(lado * lado * 3);
    let semilla = 2381;
    for (let indice = 0; indice < pixeles.length; indice++) {
      semilla = (Math.imul(1664525, semilla) + 1013904223) >>> 0;
      pixeles[indice] = semilla >>> 24;
    }
    const jpeg = await sharp(pixeles, { raw: { width: lado, height: lado, channels: 3 } })
      .jpeg({ quality: 50 }).toBuffer();
    expect(jpeg.length).toBeLessThan(limite);
    await expect(sanearLogoPortal(jpeg, 'image/jpeg')).rejects.toThrow('logo saneado');
  }, 20_000);
});
