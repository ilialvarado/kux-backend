// ═══════════════════════════════════════════════
// KÚX — Seed V3: Datos REALES del negocio
// Basado en: Archivo_Hector_PARA_CREACION_SISTEMA.xls
// Ejecutar: npm run seed:v3
// ═══════════════════════════════════════════════
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');

async function seedV3() {
  try {
    console.log('[KÚX Seed V3] Insertando datos REALES del negocio...');

    // ════════════════════════════════════════
    // LIMPIAR datos de ejemplo anteriores
    // ════════════════════════════════════════
    await pool.query("DELETE FROM products WHERE slug LIKE 'camiseta%' OR slug LIKE 'shorts%' OR slug LIKE 'proteina-whey%' OR slug LIKE 'pre-workout%' OR slug LIKE 'guantes%' OR slug LIKE 'hoodie%' OR slug LIKE 'bcaa%' OR slug LIKE 'banda%'");
    await pool.query("DELETE FROM membership_plans WHERE slug IN ('basic','pro','elite')");
    await pool.query("DELETE FROM class_types WHERE slug IN ('fuerza','boxeo','yoga','cardio','pilates')");

    // ════════════════════════════════════════
    // PERSONAL REAL (Hoja: ESTRUCTURA DEL NEGOCIO)
    // ════════════════════════════════════════
    const staffHash = await bcrypt.hash('staff123', 12);

    // Actualizar la dueña
    await pool.query(`UPDATE users SET first_name='Alma', last_name='Blazquez Garcia', 
      job_description='Supervision analitica de actividades diarias',
      schedule='5 AM A 10 PM', work_days='DIARIO' WHERE email='admin@kux.com'`);

    // Staff real
    const staffData = [
      ['merari@kux.com','manager','Merari Samai','Gallegos Acuña','Asistente ejecutiva personal','Control de actividades, formatos, etc','8:30 AM A 4:30 PM','LUNES A SABADO'],
      ['araceli@kux.com','manager','Araceli','Cabañas Mendoza','Coordinadora de operaciones','Cobros, controles de todo el personal, caja','11 AM A 10 PM','LUNES A VIERNES'],
      ['vania@kux.com','staff','Vania Jazin','Garcia Ortiz','Asesor de membresías','Recepcion de clientes, cerradores de ventas, cobros','8 AM A 4 PM','LUNES A SABADO'],
      ['daniel@kux.com','staff','Daniel Kaled','Espinosa Ordaz','Asesor de membresías','Recepcion de clientes, cerradores de ventas, cobros','12 PM A 8 PM','LUNES A VIERNES'],
      ['mario.m@kux.com','staff','Mario Alexis','Madrigal Cervantes','Dirección y control física','Test inicial de salud y seguimiento, Entrenador Hiit y Funcional','5 AM A 2 PM','LUNES A VIERNES'],
      ['mario.e@kux.com','staff','Mario Alberto','Escamilla Gastelum','Entrenador GYM y Nutriólogo','Entrenador GYM / Consulta Nutriológica Especializada','6 AM A 12 PM / 12 PM A 6 PM','LUNES A VIERNES'],
      ['susana@kux.com','staff','Susana Estefanía','Rios Bravos','Entrenadora GYM','Entrenadora GYM','2 PM A 10 PM','LUNES A VIERNES'],
      ['marco@kux.com','staff','Marco Ivan','Gonzales Loverol','Nutriólogo general','Consulta Nutriológica básica','7 AM A 12 PM / 8 AM A 2 PM','JUEVES Y SABADO'],
      ['rosa@kux.com','staff','Rosa María','Pérez Pérez','Psicóloga consultoría','Consulta básica','9:30 AM A 1:30 PM','MARTES Y MIERCOLES'],
      ['yael@kux.com','staff','Yael Eliel','López Hernández','Médico General','Consulta general','1 PM A 6 PM','MARTES Y JUEVES'],
      ['yeshua@kux.com','staff','Yeshua Octavio','Cruz Hernandez','Yoga aeróbica','Clases de Yoga','11 AM A 12 PM / 4:30 PM A 5:30 PM','LUNES A VIERNES'],
      ['logan@kux.com','staff','Logan Israel','Syverson Vargas','Calistenia y funcional','Clases de calistenia y Funcional','6 PM A 9 PM','LUNES A VIERNES'],
      ['yaquelin@kux.com','staff','Yaquelin','','Maestro Baile','Clases de Zumba','7:30 PM A 8:30 PM','LUNES A VIERNES'],
      ['diego.c@kux.com','staff','Diego Alaín','Calvo García','Maestro Baile','Clases de Zumba, Cumbia, Salsa y Urbano','8 AM A 11 AM','LUNES A SABADO'],
      ['francisco@kux.com','staff','Francisco Javier','Olvera Hernandez','Maestro Baile','Clases de Zumba, Cumbia, Salsa y Urbano','6 PM A 9 PM','LUNES A VIERNES'],
    ];

    for (const [email, role, fname, lname, title, desc, sched, days] of staffData) {
      const qr = 'QR-KUX-STAFF-' + email.split('@')[0].toUpperCase();
      await pool.query(`
        INSERT INTO users (email, password_hash, role, first_name, last_name, qr_code, job_description, schedule, work_days)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (email) DO UPDATE SET first_name=$4, last_name=$5, role=$3, job_description=$7, schedule=$8, work_days=$9
      `, [email, staffHash, role, fname, lname, qr, title + ' — ' + desc, sched, days]);
    }

    // ════════════════════════════════════════
    // PRODUCTOS REALES (Hoja: PRODUCTOS)
    // 82 productos con precios y costos reales
    // ════════════════════════════════════════
    const productos = [
      ['Quinoa Rice Cakes',20,10.35,'Comida'],['Taifelds Galletas de Avena con nuez',12,4.70,'Comida'],['Taifelds Panecillos',12,3.40,'Comida'],
      ['Blueberry Chia Cookies',14,7.90,'Comida'],['Barrinolas',28,14,'Comida'],
      ['FIBO Barra Proteína Cookies & Cream',45,34,'Comida'],['FIBO Barra Proteína Chocolate',45,34,'Comida'],['FIBO Barra Proteína Frutos Rojos',45,34,'Comida'],
      ['FIBO Barra Proteína Brownie',45,34,'Comida'],['FIBO Barra Proteína Coco Manzana (Vegana)',35,25,'Comida'],
      ['Volt Botella Mora Azul',25,13,'Bebida'],['Volt Lata Mora Azul',25,13,'Bebida'],['Volt Lata Guaraná',25,13,'Bebida'],
      ['Volt Lata Frutas del Bosque',25,13,'Bebida'],['Volt Lata Uva',25,13,'Bebida'],['Volt Lata Ponche de Frutas',25,13,'Bebida'],
      ['Amper',25,13,'Bebida'],['Predador Energy',25,13,'Bebida'],['Monster Energy Negra',25,13,'Bebida'],
      ['Santa Clara Fresa Caja',15,11,'Bebida'],['Santa Clara Capuccino Caja',15,11,'Bebida'],['Santa Clara Chocolate Caja',15,11,'Bebida'],
      ['Psychotic Blue Raspberry (negra)',20,11,'Pre entreno'],['Psychotic Blood Orange (blanco)',20,12,'Pre entreno'],
      ['Psychotic Ponche de Frutas (dorada)',20,11,'Pre entreno'],['Psychotic Ponche de Frutas (negra)',20,11,'Pre entreno'],
      ['Psychotic Grape Uva (plateada)',20,11,'Pre entreno'],['Psychotic Apple Manzana (roja)',20,11,'Pre entreno'],
      ['Psychotic Blue Punch (dorada)',20,12,'Pre entreno'],['Psychotic Gummy Candy (roja)',20,11,'Pre entreno'],
      ['Psychotic Variados',25,16,'Pre entreno'],['Venom Tamarindo (negra)',20,12,'Pre entreno'],
      ['Dragon Whey',20,10,'Proteína'],['MYO-VECTOR FEMME',35,20,'Proteína'],['MYO-VECTOR WHEY Chocolate',25,12,'Proteína'],
      ['ISOZERO Capuchino',35,16,'Proteína'],['BIRDMAN Chocolate Azul',35,20,'Proteína'],
      ['BIRDMAN Choco Bronze Negro',40,23,'Creatina'],['USN Creatina',15,6,'Creatina'],['BIRDMAN Creatina',10,5,'Creatina'],
      ['Gat Sport Creatina',10,3,'Creatina'],['Sexy Stone Arroz con Leche',20,9,'Creatina'],
      ['Caprice Fuerza de Crecimiento',24,12,'Higiene Personal'],['Caprice Fuerza Anticaídas',24,12,'Higiene Personal'],
      ['Top sin manga',160,90,'Ropa'],['Playeras Manga Larga',220,110,'Ropa'],['Toreritas Licra',250,110,'Ropa'],
      ['Torerita Algodón',250,130,'Ropa'],['Short',160,90,'Ropa'],['Leggin',260,180,'Ropa'],
      ['Pantalones Acampanados',320,220,'Ropa'],['Pantalones Térmicos',500,250,'Ropa'],['Enterizos tipo Short',360,250,'Ropa'],
      ['Enterizo Manga Larga Campana',590,360,'Ropa'],['Enterizos sin Mangas',540,340,'Ropa'],['Enterizo Rayita',540,340,'Ropa'],
      ['Gel Antibacterial',26,125,'Higiene Personal'],['Agua E-pura 1 lt',20,10,'Bebida'],
      ['Sedal Rizos Rosa',24,12,'Higiene Personal'],['Sedal Azul',24,12,'Higiene Personal'],
      ['Pantene Bolsas',10,4,'Higiene Personal'],['Head & Shoulders Paquetes',10,4,'Higiene Personal'],
      ['Agua Nestlé 1lt',20,10,'Bebida'],['Agua Ciel 1lt',20,10,'Bebida'],['Agua Santa María 1lt',20,10,'Bebida'],
      ['Agua Bonafont 1lt',20,10,'Bebida'],['Agua Económica 1/2 lt',10,3.50,'Bebida'],
      ['Batido Chico',45,22.50,'Bebida'],['Batido Grande',95,47.50,'Bebida'],
      ['Batido Chico (Proteína Base)',60,30,'Bebida'],['Batido Grande (Proteína Base)',110,55,'Bebida'],
      ['Toallas para Sudor',25,12,'Aseo personal'],
      ['Miel Virgen Frutos Secos',60,30,'Comida'],['Miel Virgen Flor de Café',60,30,'Comida'],
      ['Extracto de Bugambilia',60,30,'Comida'],['Extracto de Eucalipto',60,30,'Comida'],
      ['Extracto de Propóleo',60,30,'Comida'],['Polen',60,30,'Comida'],
      ['Ensalada de Pollo',65,30,'Comida'],['Ensalada de Atún',70,35,'Comida'],
      ['Ensalada de Bisteck',65,30,'Comida'],['Ensalada de Queso Panela',65,30,'Comida'],
    ];

    for (const [name, price, cost, cat] of productos) {
      const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
      await pool.query(`
        INSERT INTO products (name, slug, category, price, cost, stock, emoji, is_active)
        VALUES ($1, $2, $3, $4, $5, 50, '📦', true)
        ON CONFLICT (slug) DO UPDATE SET name=$1, price=$4, cost=$5, category=$3
      `, [name, slug, cat, price, cost]);
    }

    // ════════════════════════════════════════
    // MEMBRESÍAS Y PAQUETES REALES
    // ════════════════════════════════════════
    const planes = [
      // Inscripciones
      ['Inscripción Paquete Fuerza','inscripcion-fuerza',500,365,'inscripcion',null,'individual'],
      ['Inscripción Paquete Fuerza Estudiante','inscripcion-fuerza-est',250,365,'inscripcion',null,'estudiante'],
      ['Inscripción Paquete Fuerza Pareja','inscripcion-fuerza-par',450,365,'inscripcion',null,'pareja'],
      ['Inscripción Corazón en Movimiento','inscripcion-corazon',650,365,'inscripcion',null,'individual'],
      ['Inscripción Corazón Movimiento Estudiante','inscripcion-corazon-est',325,365,'inscripcion',null,'estudiante'],
      ['Inscripción Corazón Movimiento Pareja','inscripcion-corazon-par',600,365,'inscripcion',null,'pareja'],
      ['Inscripción Latidos Activos','inscripcion-latidos',800,365,'inscripcion',null,'individual'],
      ['Inscripción Latidos Activos Estudiante','inscripcion-latidos-est',400,365,'inscripcion',null,'estudiante'],
      ['Inscripción Latidos Activos Pareja','inscripcion-latidos-par',750,365,'inscripcion',null,'pareja'],
      // Mensualidades
      ['Paquete Fuerza','paquete-fuerza',500,30,'mensualidad','Acceso completo al GYM + Clases de Calistenia','individual'],
      ['Paquete Fuerza Estudiante','paquete-fuerza-est',400,30,'mensualidad','Acceso completo al GYM + Clases de Calistenia','estudiante'],
      ['Paquete Fuerza Pareja','paquete-fuerza-par',450,30,'mensualidad','Acceso completo al GYM + Clases de Calistenia','pareja'],
      ['Corazón en Movimiento 20H','corazon-20h',1000,30,'mensualidad','20H Clases de Baile (zumba, cumbia, salsa, urbano, KPOP) + GYM completo','individual'],
      ['Corazón en Movimiento Ilimitado','corazon-ilimitado',1500,30,'mensualidad','Clases Ilimitadas de Baile + GYM completo','individual'],
      ['Latidos Activos 20H','latidos-20h',1800,30,'mensualidad','20H Disciplinas (Hiit, Funcional, Yoga, Meditación, Pilates) + GYM completo','individual'],
      ['Latidos Activos Ilimitado','latidos-ilimitado',2500,30,'mensualidad','Clases ilimitadas todas las Disciplinas + GYM completo','individual'],
      // Servicios individuales
      ['Consulta Médica General','consulta-medica',150,1,'servicio','Atención médica básica','individual'],
      ['Terapia Psicológica','terapia-psicologica',700,1,'servicio','Acompañamiento emocional profesional','individual'],
      ['Consultoría Psicológica','consultoria-psicologica',300,1,'servicio','Orientación psicológica','individual'],
      ['Consulta Nutriólogo','consulta-nutriologo',300,1,'servicio','Asesoría profesional en alimentación','individual'],
    ];

    for (const [name, slug, price, days, ptype, includes, variant] of planes) {
      await pool.query(`
        INSERT INTO membership_plans (name, slug, price, duration_days, plan_type, includes, variant, is_active, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7, true, $4)
        ON CONFLICT (slug) DO UPDATE SET name=$1, price=$3, duration_days=$4, plan_type=$5, includes=$6, variant=$7
      `, [name, slug, price, days, ptype, includes, variant]);
    }

    // ════════════════════════════════════════
    // SERVICIOS / CLASES REALES
    // ════════════════════════════════════════
    const servicios = [
      ['Gimnasio','gimnasio','#00c9a7',0,100,false,'gym'],
      ['Funcional','funcional','#ef4444',60,10,false,'class'],
      ['HIIT','hiit','#f59e0b',30,10,false,'class'],
      ['K-Pop','kpop','#d946ef',60,25,false,'class'],
      ['Zumba','zumba','#ec4899',50,25,false,'class'],
      ['Salsa','salsa','#f97316',60,25,false,'class'],
      ['Cumbia','cumbia','#f97316',60,25,false,'class'],
      ['Urbano','urbano','#8b5cf6',120,25,false,'class'],
      ['Pilates','pilates-clase','#10b981',60,15,false,'class'],
      ['Yoga Aeróbica','yoga-aerobica','#6366f1',60,15,false,'class'],
      ['Yoga','yoga-clase','#6366f1',60,15,false,'class'],
      ['Meditación Guiada','meditacion','#a78bfa',60,15,false,'class'],
      ['Calistenia','calistenia','#14b8a6',60,15,false,'class'],
      ['Nutriólogo','nutriologo','#22c55e',30,1,true,'consultation'],
      ['Medicina General','medicina-general','#3b82f6',30,1,true,'consultation'],
      ['Psicología Terapia','psicologia-terapia','#e11d48',60,1,true,'consultation'],
      ['Psicología Consultoría','psicologia-consultoria','#e11d48',30,1,true,'consultation'],
    ];

    for (const [name, slug, color, dur, cap, res, stype] of servicios) {
      await pool.query(`
        INSERT INTO class_types (name, slug, color, duration_min, max_capacity, requires_reservation, service_type)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (slug) DO UPDATE SET name=$1, color=$3, duration_min=$4, max_capacity=$5, requires_reservation=$6, service_type=$7
      `, [name, slug, color, dur, cap, res, stype]);
    }

    // ════════════════════════════════════════
    // RESUMEN
    // ════════════════════════════════════════
    const prodCount = await pool.query("SELECT COUNT(*) FROM products");
    const planCount = await pool.query("SELECT COUNT(*) FROM membership_plans");
    const classCount = await pool.query("SELECT COUNT(*) FROM class_types");
    const staffCount = await pool.query("SELECT COUNT(*) FROM users WHERE role IN ('owner','manager','staff')");

    console.log('[KÚX Seed V3] ✓ Datos reales insertados:');
    console.log(`  📦 ${prodCount.rows[0].count} productos (comida, bebidas, ropa, suplementos, higiene)`);
    console.log(`  🎫 ${planCount.rows[0].count} planes/paquetes (inscripciones + mensualidades + servicios)`);
    console.log(`  🗓  ${classCount.rows[0].count} tipos de clase/servicio`);
    console.log(`  👥 ${staffCount.rows[0].count} personal (dueña + gerentes + staff)`);
    console.log('');
    console.log('  Paquetes de membresía:');
    console.log('    💪 Paquete Fuerza: $500/mes (GYM + Calistenia)');
    console.log('    💃 Corazón en Movimiento: $1,000-$1,500/mes (Baile + GYM)');
    console.log('    🔥 Latidos Activos: $1,800-$2,500/mes (Todo incluido)');
    console.log('    🎓 Variantes: Estudiante y Pareja disponibles');

  } catch (err) {
    console.error('[KÚX Seed V3] ✕ Error:', err.message);
  } finally {
    await pool.end();
  }
}

seedV3();
