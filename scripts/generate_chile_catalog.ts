// scripts/generate_chile_catalog.ts
// Generador oficial del catálogo geográfico de Chile (CUT - INE / SUBDERE)
// 16 Regiones, 346 Comunas
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ChileanCommune {
  commune_code: string;
  commune_name: string;
  province_name: string;
  region_code: string;
  region_name: string;
  region_roman: string;
}

export interface ChileanRegion {
  region_code: string;
  region_name: string;
  region_roman: string;
  communes: {
    commune_code: string;
    commune_name: string;
    province_name: string;
  }[];
}

const REGIONS_DATA: ChileanRegion[] = [
  {
    region_code: '15',
    region_name: 'Arica y Parinacota',
    region_roman: 'XV',
    communes: [
      { commune_code: '15101', commune_name: 'Arica', province_name: 'Arica' },
      { commune_code: '15102', commune_name: 'Camarones', province_name: 'Arica' },
      { commune_code: '15201', commune_name: 'Putre', province_name: 'Parinacota' },
      { commune_code: '15202', commune_name: 'General Lagos', province_name: 'Parinacota' }
    ]
  },
  {
    region_code: '01',
    region_name: 'Tarapacá',
    region_roman: 'I',
    communes: [
      { commune_code: '01101', commune_name: 'Iquique', province_name: 'Iquique' },
      { commune_code: '01107', commune_name: 'Alto Hospicio', province_name: 'Iquique' },
      { commune_code: '01401', commune_name: 'Pozo Almonte', province_name: 'Tamarugal' },
      { commune_code: '01402', commune_name: 'Camiña', province_name: 'Tamarugal' },
      { commune_code: '01403', commune_name: 'Colchane', province_name: 'Tamarugal' },
      { commune_code: '01404', commune_name: 'Huara', province_name: 'Tamarugal' },
      { commune_code: '01405', commune_name: 'Pica', province_name: 'Tamarugal' }
    ]
  },
  {
    region_code: '02',
    region_name: 'Antofagasta',
    region_roman: 'II',
    communes: [
      { commune_code: '02101', commune_name: 'Antofagasta', province_name: 'Antofagasta' },
      { commune_code: '02102', commune_name: 'Mejillones', province_name: 'Antofagasta' },
      { commune_code: '02103', commune_name: 'Sierra Gorda', province_name: 'Antofagasta' },
      { commune_code: '02104', commune_name: 'Taltal', province_name: 'Antofagasta' },
      { commune_code: '02201', commune_name: 'Calama', province_name: 'El Loa' },
      { commune_code: '02202', commune_name: 'Ollagüe', province_name: 'El Loa' },
      { commune_code: '02203', commune_name: 'San Pedro de Atacama', province_name: 'El Loa' },
      { commune_code: '02301', commune_name: 'Tocopilla', province_name: 'Tocopilla' },
      { commune_code: '02302', commune_name: 'María Elena', province_name: 'Tocopilla' }
    ]
  },
  {
    region_code: '03',
    region_name: 'Atacama',
    region_roman: 'III',
    communes: [
      { commune_code: '03101', commune_name: 'Copiapó', province_name: 'Copiapó' },
      { commune_code: '03102', commune_name: 'Caldera', province_name: 'Copiapó' },
      { commune_code: '03103', commune_name: 'Tierra Amarilla', province_name: 'Copiapó' },
      { commune_code: '03201', commune_name: 'Chañaral', province_name: 'Chañaral' },
      { commune_code: '03202', commune_name: 'Diego de Almagro', province_name: 'Chañaral' },
      { commune_code: '03301', commune_name: 'Vallenar', province_name: 'Huasco' },
      { commune_code: '03302', commune_name: 'Alto del Carmen', province_name: 'Huasco' },
      { commune_code: '03303', commune_name: 'Freirina', province_name: 'Huasco' },
      { commune_code: '03304', commune_name: 'Huasco', province_name: 'Huasco' }
    ]
  },
  {
    region_code: '04',
    region_name: 'Coquimbo',
    region_roman: 'IV',
    communes: [
      { commune_code: '04101', commune_name: 'La Serena', province_name: 'Elqui' },
      { commune_code: '04102', commune_name: 'Coquimbo', province_name: 'Elqui' },
      { commune_code: '04103', commune_name: 'Andacollo', province_name: 'Elqui' },
      { commune_code: '04104', commune_name: 'La Higuera', province_name: 'Elqui' },
      { commune_code: '04105', commune_name: 'Paihuano', province_name: 'Elqui' },
      { commune_code: '04106', commune_name: 'Vicuña', province_name: 'Elqui' },
      { commune_code: '04201', commune_name: 'Illapel', province_name: 'Choapa' },
      { commune_code: '04202', commune_name: 'Canela', province_name: 'Choapa' },
      { commune_code: '04203', commune_name: 'Los Vilos', province_name: 'Choapa' },
      { commune_code: '04204', commune_name: 'Salamanca', province_name: 'Choapa' },
      { commune_code: '04301', commune_name: 'Ovalle', province_name: 'Limarí' },
      { commune_code: '04302', commune_name: 'Combarbalá', province_name: 'Limarí' },
      { commune_code: '04303', commune_name: 'Monte Patria', province_name: 'Limarí' },
      { commune_code: '04304', commune_name: 'Punitaqui', province_name: 'Limarí' },
      { commune_code: '04305', commune_name: 'Río Hurtado', province_name: 'Limarí' }
    ]
  },
  {
    region_code: '05',
    region_name: 'Valparaíso',
    region_roman: 'V',
    communes: [
      { commune_code: '05101', commune_name: 'Valparaíso', province_name: 'Valparaíso' },
      { commune_code: '05102', commune_name: 'Casablanca', province_name: 'Valparaíso' },
      { commune_code: '05103', commune_name: 'Concón', province_name: 'Valparaíso' },
      { commune_code: '05104', commune_name: 'Juan Fernández', province_name: 'Valparaíso' },
      { commune_code: '05105', commune_name: 'Puchuncaví', province_name: 'Valparaíso' },
      { commune_code: '05107', commune_name: 'Quintero', province_name: 'Valparaíso' },
      { commune_code: '05109', commune_name: 'Viña del Mar', province_name: 'Valparaíso' },
      { commune_code: '05201', commune_name: 'Isla de Pascua', province_name: 'Isla de Pascua' },
      { commune_code: '05301', commune_name: 'Los Andes', province_name: 'Los Andes' },
      { commune_code: '05302', commune_name: 'Calle Larga', province_name: 'Los Andes' },
      { commune_code: '05303', commune_name: 'Rinconada', province_name: 'Los Andes' },
      { commune_code: '05304', commune_name: 'San Esteban', province_name: 'Los Andes' },
      { commune_code: '05401', commune_name: 'La Ligua', province_name: 'Petorca' },
      { commune_code: '05402', commune_name: 'Cabildo', province_name: 'Petorca' },
      { commune_code: '05403', commune_name: 'Papudo', province_name: 'Petorca' },
      { commune_code: '05404', commune_name: 'Petorca', province_name: 'Petorca' },
      { commune_code: '05405', commune_name: 'Zapallar', province_name: 'Petorca' },
      { commune_code: '05501', commune_name: 'Quillota', province_name: 'Quillota' },
      { commune_code: '05502', commune_name: 'La Calera', province_name: 'Quillota' },
      { commune_code: '05503', commune_name: 'Hijuelas', province_name: 'Quillota' },
      { commune_code: '05504', commune_name: 'La Cruz', province_name: 'Quillota' },
      { commune_code: '05506', commune_name: 'Nogales', province_name: 'Quillota' },
      { commune_code: '05601', commune_name: 'San Antonio', province_name: 'San Antonio' },
      { commune_code: '05602', commune_name: 'Algarrobo', province_name: 'San Antonio' },
      { commune_code: '05603', commune_name: 'Cartagena', province_name: 'San Antonio' },
      { commune_code: '05604', commune_name: 'El Quisco', province_name: 'San Antonio' },
      { commune_code: '05605', commune_name: 'El Tabo', province_name: 'San Antonio' },
      { commune_code: '05606', commune_name: 'Santo Domingo', province_name: 'San Antonio' },
      { commune_code: '05701', commune_name: 'San Felipe', province_name: 'San Felipe de Aconcagua' },
      { commune_code: '05702', commune_name: 'Catemu', province_name: 'San Felipe de Aconcagua' },
      { commune_code: '05703', commune_name: 'Llaillay', province_name: 'San Felipe de Aconcagua' },
      { commune_code: '05704', commune_name: 'Panquehue', province_name: 'San Felipe de Aconcagua' },
      { commune_code: '05705', commune_name: 'Putaendo', province_name: 'San Felipe de Aconcagua' },
      { commune_code: '05706', commune_name: 'Santa María', province_name: 'San Felipe de Aconcagua' },
      { commune_code: '05801', commune_name: 'Quilpué', province_name: 'Marga Marga' },
      { commune_code: '05802', commune_name: 'Limache', province_name: 'Marga Marga' },
      { commune_code: '05803', commune_name: 'Olmué', province_name: 'Marga Marga' },
      { commune_code: '05804', commune_name: 'Villa Alemana', province_name: 'Marga Marga' }
    ]
  },
  {
    region_code: '13',
    region_name: 'Metropolitana de Santiago',
    region_roman: 'RM',
    communes: [
      { commune_code: '13101', commune_name: 'Santiago', province_name: 'Santiago' },
      { commune_code: '13102', commune_name: 'Cerrillos', province_name: 'Santiago' },
      { commune_code: '13103', commune_name: 'Cerro Navia', province_name: 'Santiago' },
      { commune_code: '13104', commune_name: 'Conchalí', province_name: 'Santiago' },
      { commune_code: '13105', commune_name: 'El Bosque', province_name: 'Santiago' },
      { commune_code: '13106', commune_name: 'Estación Central', province_name: 'Santiago' },
      { commune_code: '13107', commune_name: 'Huechuraba', province_name: 'Santiago' },
      { commune_code: '13108', commune_name: 'Independencia', province_name: 'Santiago' },
      { commune_code: '13109', commune_name: 'La Cisterna', province_name: 'Santiago' },
      { commune_code: '13110', commune_name: 'La Florida', province_name: 'Santiago' },
      { commune_code: '13111', commune_name: 'La Granja', province_name: 'Santiago' },
      { commune_code: '13112', commune_name: 'La Pintana', province_name: 'Santiago' },
      { commune_code: '13113', commune_name: 'La Reina', province_name: 'Santiago' },
      { commune_code: '13114', commune_name: 'Las Condes', province_name: 'Santiago' },
      { commune_code: '13115', commune_name: 'Lo Barnechea', province_name: 'Santiago' },
      { commune_code: '13116', commune_name: 'Lo Espejo', province_name: 'Santiago' },
      { commune_code: '13117', commune_name: 'Lo Prado', province_name: 'Santiago' },
      { commune_code: '13118', commune_name: 'Macul', province_name: 'Santiago' },
      { commune_code: '13119', commune_name: 'Maipú', province_name: 'Santiago' },
      { commune_code: '13120', commune_name: 'Ñuñoa', province_name: 'Santiago' },
      { commune_code: '13121', commune_name: 'Pedro Aguirre Cerda', province_name: 'Santiago' },
      { commune_code: '13122', commune_name: 'Peñalolén', province_name: 'Santiago' },
      { commune_code: '13123', commune_name: 'Providencia', province_name: 'Santiago' },
      { commune_code: '13124', commune_name: 'Pudahuel', province_name: 'Santiago' },
      { commune_code: '13125', commune_name: 'Quilicura', province_name: 'Santiago' },
      { commune_code: '13126', commune_name: 'Quinta Normal', province_name: 'Santiago' },
      { commune_code: '13127', commune_name: 'Recoleta', province_name: 'Santiago' },
      { commune_code: '13128', commune_name: 'Renca', province_name: 'Santiago' },
      { commune_code: '13129', commune_name: 'San Joaquín', province_name: 'Santiago' },
      { commune_code: '13130', commune_name: 'San Miguel', province_name: 'Santiago' },
      { commune_code: '13131', commune_name: 'San Ramón', province_name: 'Santiago' },
      { commune_code: '13132', commune_name: 'Vitacura', province_name: 'Santiago' },
      { commune_code: '13201', commune_name: 'Puente Alto', province_name: 'Cordillera' },
      { commune_code: '13202', commune_name: 'Pirque', province_name: 'Cordillera' },
      { commune_code: '13203', commune_name: 'San José de Maipo', province_name: 'Cordillera' },
      { commune_code: '13301', commune_name: 'Colina', province_name: 'Chacabuco' },
      { commune_code: '13302', commune_name: 'Lampa', province_name: 'Chacabuco' },
      { commune_code: '13303', commune_name: 'Tiltil', province_name: 'Chacabuco' },
      { commune_code: '13401', commune_name: 'San Bernardo', province_name: 'Maipo' },
      { commune_code: '13402', commune_name: 'Buin', province_name: 'Maipo' },
      { commune_code: '13403', commune_name: 'Calera de Tango', province_name: 'Maipo' },
      { commune_code: '13404', commune_name: 'Paine', province_name: 'Maipo' },
      { commune_code: '13501', commune_name: 'Melipilla', province_name: 'Melipilla' },
      { commune_code: '13502', commune_name: 'Alhué', province_name: 'Melipilla' },
      { commune_code: '13503', commune_name: 'Curacaví', province_name: 'Melipilla' },
      { commune_code: '13504', commune_name: 'María Pinto', province_name: 'Melipilla' },
      { commune_code: '13505', commune_name: 'San Pedro', province_name: 'Melipilla' },
      { commune_code: '13601', commune_name: 'Talagante', province_name: 'Talagante' },
      { commune_code: '13602', commune_name: 'El Monte', province_name: 'Talagante' },
      { commune_code: '13603', commune_name: 'Isla de Maipo', province_name: 'Talagante' },
      { commune_code: '13604', commune_name: 'Padre Hurtado', province_name: 'Talagante' },
      { commune_code: '13605', commune_name: 'Peñaflor', province_name: 'Talagante' }
    ]
  },
  {
    region_code: '06',
    region_name: "Libertador General Bernardo O'Higgins",
    region_roman: 'VI',
    communes: [
      { commune_code: '06101', commune_name: 'Rancagua', province_name: 'Cachapoal' },
      { commune_code: '06102', commune_name: 'Codegua', province_name: 'Cachapoal' },
      { commune_code: '06103', commune_name: 'Coinco', province_name: 'Cachapoal' },
      { commune_code: '06104', commune_name: 'Coltauco', province_name: 'Cachapoal' },
      { commune_code: '06105', commune_name: 'Doñihue', province_name: 'Cachapoal' },
      { commune_code: '06106', commune_name: 'Graneros', province_name: 'Cachapoal' },
      { commune_code: '06107', commune_name: 'Las Cabras', province_name: 'Cachapoal' },
      { commune_code: '06108', commune_name: 'Machalí', province_name: 'Cachapoal' },
      { commune_code: '06109', commune_name: 'Malloa', province_name: 'Cachapoal' },
      { commune_code: '06110', commune_name: 'Mostazal', province_name: 'Cachapoal' },
      { commune_code: '06111', commune_name: 'Olivar', province_name: 'Cachapoal' },
      { commune_code: '06112', commune_name: 'Peumo', province_name: 'Cachapoal' },
      { commune_code: '06113', commune_name: 'Pichidegua', province_name: 'Cachapoal' },
      { commune_code: '06114', commune_name: 'Quinta de Tilcoco', province_name: 'Cachapoal' },
      { commune_code: '06115', commune_name: 'Rengo', province_name: 'Cachapoal' },
      { commune_code: '06116', commune_name: 'Requínoa', province_name: 'Cachapoal' },
      { commune_code: '06117', commune_name: 'San Vicente', province_name: 'Cachapoal' },
      { commune_code: '06201', commune_name: 'Pichilemu', province_name: 'Cardenal Caro' },
      { commune_code: '06202', commune_name: 'La Estrella', province_name: 'Cardenal Caro' },
      { commune_code: '06203', commune_name: 'Litueche', province_name: 'Cardenal Caro' },
      { commune_code: '06204', commune_name: 'Marchihue', province_name: 'Cardenal Caro' },
      { commune_code: '06205', commune_name: 'Navidad', province_name: 'Cardenal Caro' },
      { commune_code: '06206', commune_name: 'Paredones', province_name: 'Cardenal Caro' },
      { commune_code: '06301', commune_name: 'San Fernando', province_name: 'Colchagua' },
      { commune_code: '06302', commune_name: 'Chépica', province_name: 'Colchagua' },
      { commune_code: '06303', commune_name: 'Chimbarongo', province_name: 'Colchagua' },
      { commune_code: '06304', commune_name: 'Lolol', province_name: 'Colchagua' },
      { commune_code: '06305', commune_name: 'Nancagua', province_name: 'Colchagua' },
      { commune_code: '06306', commune_name: 'Palmilla', province_name: 'Colchagua' },
      { commune_code: '06307', commune_name: 'Peralillo', province_name: 'Colchagua' },
      { commune_code: '06308', commune_name: 'Placilla', province_name: 'Colchagua' },
      { commune_code: '06309', commune_name: 'Pumanque', province_name: 'Colchagua' },
      { commune_code: '06310', commune_name: 'Santa Cruz', province_name: 'Colchagua' }
    ]
  },
  {
    region_code: '07',
    region_name: 'Maule',
    region_roman: 'VII',
    communes: [
      { commune_code: '07101', commune_name: 'Talca', province_name: 'Talca' },
      { commune_code: '07102', commune_name: 'Constitución', province_name: 'Talca' },
      { commune_code: '07103', commune_name: 'Curepto', province_name: 'Talca' },
      { commune_code: '07104', commune_name: 'Empedrado', province_name: 'Talca' },
      { commune_code: '07105', commune_name: 'Maule', province_name: 'Talca' },
      { commune_code: '07106', commune_name: 'Pelarco', province_name: 'Talca' },
      { commune_code: '07107', commune_name: 'Pencahue', province_name: 'Talca' },
      { commune_code: '07108', commune_name: 'Río Claro', province_name: 'Talca' },
      { commune_code: '07109', commune_name: 'San Clemente', province_name: 'Talca' },
      { commune_code: '07110', commune_name: 'San Rafael', province_name: 'Talca' },
      { commune_code: '07201', commune_name: 'Cauquenes', province_name: 'Cauquenes' },
      { commune_code: '07202', commune_name: 'Chanco', province_name: 'Cauquenes' },
      { commune_code: '07203', commune_name: 'Pelluhue', province_name: 'Cauquenes' },
      { commune_code: '07301', commune_name: 'Curicó', province_name: 'Curicó' },
      { commune_code: '07302', commune_name: 'Hualañé', province_name: 'Curicó' },
      { commune_code: '07303', commune_name: 'Licantén', province_name: 'Curicó' },
      { commune_code: '07304', commune_name: 'Molina', province_name: 'Curicó' },
      { commune_code: '07305', commune_name: 'Rauco', province_name: 'Curicó' },
      { commune_code: '07306', commune_name: 'Romeral', province_name: 'Curicó' },
      { commune_code: '07307', commune_name: 'Sagrada Familia', province_name: 'Curicó' },
      { commune_code: '07308', commune_name: 'Teno', province_name: 'Curicó' },
      { commune_code: '07309', commune_name: 'Vichuquén', province_name: 'Curicó' },
      { commune_code: '07401', commune_name: 'Linares', province_name: 'Linares' },
      { commune_code: '07402', commune_name: 'Colbún', province_name: 'Linares' },
      { commune_code: '07403', commune_name: 'Longaví', province_name: 'Linares' },
      { commune_code: '07404', commune_name: 'Parral', province_name: 'Linares' },
      { commune_code: '07405', commune_name: 'Retiro', province_name: 'Linares' },
      { commune_code: '07406', commune_name: 'San Javier', province_name: 'Linares' },
      { commune_code: '07407', commune_name: 'Villa Alegre', province_name: 'Linares' },
      { commune_code: '07408', commune_name: 'Yerbas Buenas', province_name: 'Linares' }
    ]
  },
  {
    region_code: '16',
    region_name: 'Ñuble',
    region_roman: 'XVI',
    communes: [
      { commune_code: '16101', commune_name: 'Chillán', province_name: 'Diguillín' },
      { commune_code: '16102', commune_name: 'Bulnes', province_name: 'Diguillín' },
      { commune_code: '16103', commune_name: 'Chillán Viejo', province_name: 'Diguillín' },
      { commune_code: '16104', commune_name: 'El Carmen', province_name: 'Diguillín' },
      { commune_code: '16105', commune_name: 'Pemuco', province_name: 'Diguillín' },
      { commune_code: '16106', commune_name: 'Pinto', province_name: 'Diguillín' },
      { commune_code: '16107', commune_name: 'Quillón', province_name: 'Diguillín' },
      { commune_code: '16108', commune_name: 'San Ignacio', province_name: 'Diguillín' },
      { commune_code: '16109', commune_name: 'Yungay', province_name: 'Diguillín' },
      { commune_code: '16201', commune_name: 'Quirihue', province_name: 'Itata' },
      { commune_code: '16202', commune_name: 'Cobquecura', province_name: 'Itata' },
      { commune_code: '16203', commune_name: 'Coelemu', province_name: 'Itata' },
      { commune_code: '16204', commune_name: 'Ninhue', province_name: 'Itata' },
      { commune_code: '16205', commune_name: 'Portezuelo', province_name: 'Itata' },
      { commune_code: '16206', commune_name: 'Ránquil', province_name: 'Itata' },
      { commune_code: '16207', commune_name: 'Treguaco', province_name: 'Itata' },
      { commune_code: '16301', commune_name: 'San Carlos', province_name: 'Punilla' },
      { commune_code: '16302', commune_name: 'Coihueco', province_name: 'Punilla' },
      { commune_code: '16303', commune_name: 'Ñiquén', province_name: 'Punilla' },
      { commune_code: '16304', commune_name: 'San Fabián', province_name: 'Punilla' },
      { commune_code: '16305', commune_name: 'San Nicolás', province_name: 'Punilla' }
    ]
  },
  {
    region_code: '08',
    region_name: 'Biobío',
    region_roman: 'VIII',
    communes: [
      { commune_code: '08101', commune_name: 'Concepción', province_name: 'Concepción' },
      { commune_code: '08102', commune_name: 'Coronel', province_name: 'Concepción' },
      { commune_code: '08103', commune_name: 'Chiguayante', province_name: 'Concepción' },
      { commune_code: '08104', commune_name: 'Florida', province_name: 'Concepción' },
      { commune_code: '08105', commune_name: 'Hualqui', province_name: 'Concepción' },
      { commune_code: '08106', commune_name: 'Lota', province_name: 'Concepción' },
      { commune_code: '08107', commune_name: 'Penco', province_name: 'Concepción' },
      { commune_code: '08108', commune_name: 'San Pedro de la Paz', province_name: 'Concepción' },
      { commune_code: '08109', commune_name: 'Santa Juana', province_name: 'Concepción' },
      { commune_code: '08110', commune_name: 'Talcahuano', province_name: 'Concepción' },
      { commune_code: '08111', commune_name: 'Tomé', province_name: 'Concepción' },
      { commune_code: '08112', commune_name: 'Hualpén', province_name: 'Concepción' },
      { commune_code: '08201', commune_name: 'Lebu', province_name: 'Arauco' },
      { commune_code: '08202', commune_name: 'Arauco', province_name: 'Arauco' },
      { commune_code: '08203', commune_name: 'Cañete', province_name: 'Arauco' },
      { commune_code: '08204', commune_name: 'Contulmo', province_name: 'Arauco' },
      { commune_code: '08205', commune_name: 'Curanilahue', province_name: 'Arauco' },
      { commune_code: '08206', commune_name: 'Los Álamos', province_name: 'Arauco' },
      { commune_code: '08207', commune_name: 'Tirúa', province_name: 'Arauco' },
      { commune_code: '08301', commune_name: 'Los Ángeles', province_name: 'Biobío' },
      { commune_code: '08302', commune_name: 'Antuco', province_name: 'Biobío' },
      { commune_code: '08303', commune_name: 'Cabrero', province_name: 'Biobío' },
      { commune_code: '08304', commune_name: 'Laja', province_name: 'Biobío' },
      { commune_code: '08305', commune_name: 'Mulchén', province_name: 'Biobío' },
      { commune_code: '08306', commune_name: 'Nacimiento', province_name: 'Biobío' },
      { commune_code: '08307', commune_name: 'Negrete', province_name: 'Biobío' },
      { commune_code: '08308', commune_name: 'Quilaco', province_name: 'Biobío' },
      { commune_code: '08309', commune_name: 'Quilleco', province_name: 'Biobío' },
      { commune_code: '08310', commune_name: 'San Rosendo', province_name: 'Biobío' },
      { commune_code: '08311', commune_name: 'Santa Bárbara', province_name: 'Biobío' },
      { commune_code: '08312', commune_name: 'Tucapel', province_name: 'Biobío' },
      { commune_code: '08313', commune_name: 'Yumbel', province_name: 'Biobío' },
      { commune_code: '08314', commune_name: 'Alto Biobío', province_name: 'Biobío' }
    ]
  },
  {
    region_code: '09',
    region_name: 'La Araucanía',
    region_roman: 'IX',
    communes: [
      { commune_code: '09101', commune_name: 'Temuco', province_name: 'Cautín' },
      { commune_code: '09102', commune_name: 'Carahue', province_name: 'Cautín' },
      { commune_code: '09103', commune_name: 'Cunco', province_name: 'Cautín' },
      { commune_code: '09104', commune_name: 'Curarrehue', province_name: 'Cautín' },
      { commune_code: '09105', commune_name: 'Freire', province_name: 'Cautín' },
      { commune_code: '09106', commune_name: 'Galvarino', province_name: 'Cautín' },
      { commune_code: '09107', commune_name: 'Gorbea', province_name: 'Cautín' },
      { commune_code: '09108', commune_name: 'Lautaro', province_name: 'Cautín' },
      { commune_code: '09109', commune_name: 'Loncoche', province_name: 'Cautín' },
      { commune_code: '09110', commune_name: 'Melipeuco', province_name: 'Cautín' },
      { commune_code: '09111', commune_name: 'Nueva Imperial', province_name: 'Cautín' },
      { commune_code: '09112', commune_name: 'Padre Las Casas', province_name: 'Cautín' },
      { commune_code: '09113', commune_name: 'Perquenco', province_name: 'Cautín' },
      { commune_code: '09114', commune_name: 'Pitrufquén', province_name: 'Cautín' },
      { commune_code: '09115', commune_name: 'Pucón', province_name: 'Cautín' },
      { commune_code: '09116', commune_name: 'Saavedra', province_name: 'Cautín' },
      { commune_code: '09117', commune_name: 'Teodoro Schmidt', province_name: 'Cautín' },
      { commune_code: '09118', commune_name: 'Toltén', province_name: 'Cautín' },
      { commune_code: '09119', commune_name: 'Vilcún', province_name: 'Cautín' },
      { commune_code: '09120', commune_name: 'Villarrica', province_name: 'Cautín' },
      { commune_code: '09121', commune_name: 'Cholchol', province_name: 'Cautín' },
      { commune_code: '09201', commune_name: 'Angol', province_name: 'Malleco' },
      { commune_code: '09202', commune_name: 'Collipulli', province_name: 'Malleco' },
      { commune_code: '09203', commune_name: 'Curacautín', province_name: 'Malleco' },
      { commune_code: '09204', commune_name: 'Ercilla', province_name: 'Malleco' },
      { commune_code: '09205', commune_name: 'Lonquimay', province_name: 'Malleco' },
      { commune_code: '09206', commune_name: 'Los Sauces', province_name: 'Malleco' },
      { commune_code: '09207', commune_name: 'Lumaco', province_name: 'Malleco' },
      { commune_code: '09208', commune_name: 'Purén', province_name: 'Malleco' },
      { commune_code: '09209', commune_name: 'Renaico', province_name: 'Malleco' },
      { commune_code: '09210', commune_name: 'Traiguén', province_name: 'Malleco' },
      { commune_code: '09211', commune_name: 'Victoria', province_name: 'Malleco' }
    ]
  },
  {
    region_code: '14',
    region_name: 'Los Ríos',
    region_roman: 'XIV',
    communes: [
      { commune_code: '14101', commune_name: 'Valdivia', province_name: 'Valdivia' },
      { commune_code: '14102', commune_name: 'Corral', province_name: 'Valdivia' },
      { commune_code: '14103', commune_name: 'Lanco', province_name: 'Valdivia' },
      { commune_code: '14104', commune_name: 'Los Lagos', province_name: 'Valdivia' },
      { commune_code: '14105', commune_name: 'Máfil', province_name: 'Valdivia' },
      { commune_code: '14106', commune_name: 'Mariquina', province_name: 'Valdivia' },
      { commune_code: '14107', commune_name: 'Paillaco', province_name: 'Valdivia' },
      { commune_code: '14108', commune_name: 'Panguipulli', province_name: 'Valdivia' },
      { commune_code: '14201', commune_name: 'La Unión', province_name: 'Ranco' },
      { commune_code: '14202', commune_name: 'Futrono', province_name: 'Ranco' },
      { commune_code: '14203', commune_name: 'Lago Ranco', province_name: 'Ranco' },
      { commune_code: '14204', commune_name: 'Río Bueno', province_name: 'Ranco' }
    ]
  },
  {
    region_code: '10',
    region_name: 'Los Lagos',
    region_roman: 'X',
    communes: [
      { commune_code: '10101', commune_name: 'Puerto Montt', province_name: 'Llanquihue' },
      { commune_code: '10102', commune_name: 'Calbuco', province_name: 'Llanquihue' },
      { commune_code: '10103', commune_name: 'Cochamó', province_name: 'Llanquihue' },
      { commune_code: '10104', commune_name: 'Fresia', province_name: 'Llanquihue' },
      { commune_code: '10105', commune_name: 'Frutillar', province_name: 'Llanquihue' },
      { commune_code: '10106', commune_name: 'Los Muermos', province_name: 'Llanquihue' },
      { commune_code: '10107', commune_name: 'Llanquihue', province_name: 'Llanquihue' },
      { commune_code: '10108', commune_name: 'Maullín', province_name: 'Llanquihue' },
      { commune_code: '10109', commune_name: 'Puerto Varas', province_name: 'Llanquihue' },
      { commune_code: '10201', commune_name: 'Castro', province_name: 'Chiloé' },
      { commune_code: '10202', commune_name: 'Ancud', province_name: 'Chiloé' },
      { commune_code: '10203', commune_name: 'Chonchi', province_name: 'Chiloé' },
      { commune_code: '10204', commune_name: 'Curaco de Vélez', province_name: 'Chiloé' },
      { commune_code: '10205', commune_name: 'Dalcahue', province_name: 'Chiloé' },
      { commune_code: '10206', commune_name: 'Puqueldón', province_name: 'Chiloé' },
      { commune_code: '10207', commune_name: 'Queilén', province_name: 'Chiloé' },
      { commune_code: '10208', commune_name: 'Quellón', province_name: 'Chiloé' },
      { commune_code: '10209', commune_name: 'Quemchi', province_name: 'Chiloé' },
      { commune_code: '10210', commune_name: 'Quinchao', province_name: 'Chiloé' },
      { commune_code: '10301', commune_name: 'Osorno', province_name: 'Osorno' },
      { commune_code: '10302', commune_name: 'Puerto Octay', province_name: 'Osorno' },
      { commune_code: '10303', commune_name: 'Purranque', province_name: 'Osorno' },
      { commune_code: '10304', commune_name: 'Puyehue', province_name: 'Osorno' },
      { commune_code: '10305', commune_name: 'Río Negro', province_name: 'Osorno' },
      { commune_code: '10306', commune_name: 'San Juan de la Costa', province_name: 'Osorno' },
      { commune_code: '10307', commune_name: 'San Pablo', province_name: 'Osorno' },
      { commune_code: '10401', commune_name: 'Chaitén', province_name: 'Palena' },
      { commune_code: '10402', commune_name: 'Futaleufú', province_name: 'Palena' },
      { commune_code: '10403', commune_name: 'Hualaihué', province_name: 'Palena' },
      { commune_code: '10404', commune_name: 'Palena', province_name: 'Palena' }
    ]
  },
  {
    region_code: '11',
    region_name: 'Aysén del General Carlos Ibáñez del Campo',
    region_roman: 'XI',
    communes: [
      { commune_code: '11101', commune_name: 'Coyhaique', province_name: 'Coyhaique' },
      { commune_code: '11102', commune_name: 'Lago Verde', province_name: 'Coyhaique' },
      { commune_code: '11201', commune_name: 'Aysén', province_name: 'Aysén' },
      { commune_code: '11202', commune_name: 'Cisnes', province_name: 'Aysén' },
      { commune_code: '11203', commune_name: 'Guaitecas', province_name: 'Aysén' },
      { commune_code: '11301', commune_name: 'Cochrane', province_name: 'Capitán Prat' },
      { commune_code: '11302', commune_name: "O'Higgins", province_name: 'Capitán Prat' },
      { commune_code: '11303', commune_name: 'Tortel', province_name: 'Capitán Prat' },
      { commune_code: '11401', commune_name: 'Chile Chico', province_name: 'General Carrera' },
      { commune_code: '11402', commune_name: 'Río Ibáñez', province_name: 'General Carrera' }
    ]
  },
  {
    region_code: '12',
    region_name: 'Magallanes y de la Antártica Chilena',
    region_roman: 'XII',
    communes: [
      { commune_code: '12101', commune_name: 'Punta Arenas', province_name: 'Magallanes' },
      { commune_code: '12102', commune_name: 'Laguna Blanca', province_name: 'Magallanes' },
      { commune_code: '12103', commune_name: 'Río Verde', province_name: 'Magallanes' },
      { commune_code: '12104', commune_name: 'San Gregorio', province_name: 'Magallanes' },
      { commune_code: '12201', commune_name: 'Cabo de Hornos', province_name: 'Antártica Chilena' },
      { commune_code: '12202', commune_name: 'Antártica', province_name: 'Antártica Chilena' },
      { commune_code: '12301', commune_name: 'Porvenir', province_name: 'Tierra del Fuego' },
      { commune_code: '12302', commune_name: 'Primavera', province_name: 'Tierra del Fuego' },
      { commune_code: '12303', commune_name: 'Timaukel', province_name: 'Tierra del Fuego' },
      { commune_code: '12401', commune_name: 'Natales', province_name: 'Última Esperanza' },
      { commune_code: '12402', commune_name: 'Torres del Paine', province_name: 'Última Esperanza' }
    ]
  }
];

// Generar lista plana de comunas
const FLAT_COMMUNES: ChileanCommune[] = [];
for (const reg of REGIONS_DATA) {
  for (const com of reg.communes) {
    FLAT_COMMUNES.push({
      commune_code: com.commune_code,
      commune_name: com.commune_name,
      province_name: com.province_name,
      region_code: reg.region_code,
      region_name: reg.region_name,
      region_roman: reg.region_roman
    });
  }
}

const outputPath = path.resolve(__dirname, '..', 'src', 'data', 'chile_geographic_catalog.json');
const payload = {
  total_regions: REGIONS_DATA.length,
  total_communes: FLAT_COMMUNES.length,
  regions: REGIONS_DATA,
  communes: FLAT_COMMUNES
};

fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf-8');
console.log(`✓ Catálogo geográfico de Chile generado con éxito:`);
console.log(`  - Regiones: ${REGIONS_DATA.length}`);
console.log(`  - Comunas:  ${FLAT_COMMUNES.length}`);
console.log(`  - Destino:  ${outputPath}`);
