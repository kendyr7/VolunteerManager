# FASE 3 — DIAGNÓSTICO DE TELÉFONOS DUPLICADOS (READ-ONLY)

> Este reporte fue generado de manera **100% READ-ONLY**. No se ejecutó ningún UPDATE, INSERT, DELETE, TRUNCATE ni ALTER sobre la base de datos Supabase.

---

## 1. RESUMEN EJECUTIVO DE DATOS

* **Total Voluntarios en BD**: 668
* **Grupos con Teléfono Duplicado**: 59
* **Colisiones de Voluntarios Activos (Active + Active)**: 56
* **Grupos con Voluntarios Archivados (Active + Archived)**: 4
* **Grupos con 3 o más Voluntarios Activos**: 6
* **Grupos con Menores de Edad**: 12
* **Grupos con Diferencias de Formato de Teléfono**: 1

---

## 2. CLASIFICACIÓN POR CATEGORÍAS SUGERIDAS

| Categoría | Cantidad | Descripción | Acción Sugerida |
| :--- | :---: | :--- | :--- |
| **CATEGORY_A** | **7** | Posible Duplicado de la Misma Persona (Nombres idénticos / mismo email) | ARCHIVAR DUPLICADO |
| **CATEGORY_B** | **49** | Posible Teléfono Compartido / Familia (Padre+Hijo / Cónyuges) | MARCAR COMO SHARED_PHONE |
| **CATEGORY_C** | **0** | Diferencia de Formato de Teléfono (+505 vs 8888) | NORMALIZAR FORMATO |
| **CATEGORY_D** | **3** | Voluntarios Archivados que conservan el teléfono | NORMALIZAR FORMATO |
| **CATEGORY_E** | **0** | Casos Ambiguos / Requieren Revisión Administrativa | REVISAR |

---

## 3. DETALLE DE GRUPOS POR CATEGORÍA

### CATEGORY A — Posibles Duplicados de la Misma Persona (7 Grupos)

#### GRUPO #1 — Teléfono Normalizado: '+50557081704'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'NOMBRES IDÉNTICOS', 'MISMO APELLIDO'
- **Acción Recomendada**: 'ARCHIVAR DUPLICADO' (Confianza: **ALTA**)
- **Notas**: Mismo nombre completo o correo electrónico. Es altamente probable que sea la misma persona registrada dos veces.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| 'b0fe328e...' | **Mariela Elizabeth Gonzalez Benavides** | 'active' | N/D | Guía | '+50557081704' | 2026-07-31 |
| 'b9f187a9...' | **Mariela Elizabeth Gonzalez Benavides** | 'active' | N/D | Guía | '+50557081704' | 2026-07-31 |

---

#### GRUPO #8 — Teléfono Normalizado: '+50588328115'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'NOMBRES IDÉNTICOS', 'MISMO APELLIDO'
- **Acción Recomendada**: 'ARCHIVAR DUPLICADO' (Confianza: **ALTA**)
- **Notas**: Mismo nombre completo o correo electrónico. Es altamente probable que sea la misma persona registrada dos veces.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '4b9b2d21...' | **Nathaly Marcela Ferrufino Escobar** | 'active' | 19 | Facilidades Físicas | '+50588328115' | 2026-07-31 |
| '5cb4eb4e...' | **Nathaly Marcela Ferrufino Escobar** | 'active' | N/D | Guía | '+50588328115' | 2026-07-31 |

---

#### GRUPO #38 — Teléfono Normalizado: '+50582384685'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'NOMBRES IDÉNTICOS', 'MISMO APELLIDO'
- **Acción Recomendada**: 'ARCHIVAR DUPLICADO' (Confianza: **ALTA**)
- **Notas**: Mismo nombre completo o correo electrónico. Es altamente probable que sea la misma persona registrada dos veces.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| 'd824f199...' | **Sandy Elizabeth Espinoza Ruiz** | 'active' | 43 | Guía | '+50582384685' | 2026-07-31 |
| '239ab488...' | **Sandy Elizabeth Espinoza Ruiz** | 'active' | 43 | Guía | '+50582384685' | 2026-07-31 |

---

#### GRUPO #45 — Teléfono Normalizado: '+50588546327'
- **Totales**: 3 Perfiles (2 Activos, 1 Archivados)
- **Etiquetas**: 'NOMBRES IDÉNTICOS', 'MISMO APELLIDO'
- **Acción Recomendada**: 'ARCHIVAR DUPLICADO' (Confianza: **ALTA**)
- **Notas**: Mismo nombre completo o correo electrónico. Es altamente probable que sea la misma persona registrada dos veces.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '92710b21...' | **Jaquline del Carmen Calderon** | 'active' | 40 | Seguridad | '+50588546327' | 2026-08-01 |
| '3675328e...' | **Drevel Jha Canel Aristhomene Forbes** | 'active' | 46 | Seguridad | '+50588546327' | 2026-08-02 |
| '105ee4b4...' | **Drevel jha canel aristhomene forbes** | 'archived' | N/D | Seguridad | '+50588546327' | 2026-08-02 |

---

#### GRUPO #53 — Teléfono Normalizado: '+50576739821'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'NOMBRES IDÉNTICOS', 'MISMO APELLIDO'
- **Acción Recomendada**: 'ARCHIVAR DUPLICADO' (Confianza: **ALTA**)
- **Notas**: Mismo nombre completo o correo electrónico. Es altamente probable que sea la misma persona registrada dos veces.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '0979be59...' | **Jorge Luis Gutiérrez Campos** | 'active' | N/D | Sin comité | '+50576739821' | 2026-08-02 |
| '3c382e9c...' | **Jorge Luis Gutiérrez Campos** | 'active' | 58 | Seguridad | '+50576739821' | 2026-08-04 |

---

#### GRUPO #54 — Teléfono Normalizado: '+50585857058'
- **Totales**: 3 Perfiles (3 Activos, 0 Archivados)
- **Etiquetas**: 'NOMBRES IDÉNTICOS', 'MISMO APELLIDO'
- **Acción Recomendada**: 'ARCHIVAR DUPLICADO' (Confianza: **ALTA**)
- **Notas**: Mismo nombre completo o correo electrónico. Es altamente probable que sea la misma persona registrada dos veces.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '6b9d4bc4...' | **Mauricio Celestino Cuarezma Mendez** | 'active' | 27 | Seguridad | '+50585857058' | 2026-08-02 |
| '31fc9b9e...' | **Mauricio Celestino Cuarezma Méndez** | 'active' | N/D | Seguridad | '+50585857058' | 2026-08-02 |
| '3558ca55...' | **Celestino cuaresma Mendez** | 'active' | 27 | Seguridad | '+50585857058' | 2026-08-04 |

---

#### GRUPO #56 — Teléfono Normalizado: '+50587961377'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'NOMBRES IDÉNTICOS', 'MISMO APELLIDO'
- **Acción Recomendada**: 'ARCHIVAR DUPLICADO' (Confianza: **ALTA**)
- **Notas**: Mismo nombre completo o correo electrónico. Es altamente probable que sea la misma persona registrada dos veces.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| 'fafe085d...' | **Ian Guzmán** | 'active' | 20 | Seguridad | '+50587961377' | 2026-08-03 |
| '833620e5...' | **Ian Guzmán** | 'active' | 20 | Seguridad | '+50587961377' | 2026-08-04 |

---

### CATEGORY B — Posibles Teléfonos Compartidos / Familia (49 Grupos)

#### GRUPO #2 — Teléfono Normalizado: '+50576096922'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'MISMO APELLIDO', 'POSIBLE FAMILIA'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **ALTA**)
- **Notas**: Integrantes con apellidos coincidentes comparten teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '5b56a494...' | **Alvin Jafet Cruz Barea** | 'active' | 21 | Facilidades Físicas | '+50576096922' | 2026-07-31 |
| 'f0fd7b91...' | **Maudiel Antonio Cruz** | 'active' | 48 | Facilidades Físicas | '+50576096922' | 2026-07-31 |

---

#### GRUPO #3 — Teléfono Normalizado: '+50581406969'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'ADULTO + MENOR', 'POSIBLE FAMILIA'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **ALTA**)
- **Notas**: Adulto y menor de edad comparten número de contacto familiar.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '02efbe35...' | **Arlen Karina Estrada Perez** | 'active' | 45 | Facilidades Físicas | '+50581406969' | 2026-07-31 |
| 'd10bd0a6...' | **Coralia Lopez** | 'active' | 15 | Guía | '+50581406969' | 2026-07-31 |

---

#### GRUPO #4 — Teléfono Normalizado: '+50581417825'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'CON MENORES', 'RELACIÓN NO DETERMINABLE'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **ALTA**)
- **Notas**: Perfiles activos con nombres distintos que comparten número de teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '713225e7...' | **Cristian Antonio Ruiz Fuentes** | 'active' | 15 | Facilidades Físicas | '+50581417825' | 2026-07-31 |
| '43c720f5...' | **Briana Isamara Ortega Gonzales** | 'active' | 17 | Guía | '+50581417825' | 2026-07-31 |

---

#### GRUPO #5 — Teléfono Normalizado: '+50588688069'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'MISMO APELLIDO', 'POSIBLE FAMILIA'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **ALTA**)
- **Notas**: Integrantes con apellidos coincidentes comparten teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '516b0553...' | **Elianing Magedla Contreras de Garache** | 'active' | 34 | Facilidades Físicas | '+50588688069' | 2026-07-31 |
| '8bb8975e...' | **Ryder Jose Garache Miranda** | 'active' | 32 | Facilidades Físicas | '+50588688069' | 2026-07-31 |

---

#### GRUPO #6 — Teléfono Normalizado: '+50583783108'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'MISMO APELLIDO', 'POSIBLE FAMILIA'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **ALTA**)
- **Notas**: Integrantes con apellidos coincidentes comparten teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '3cf27d4d...' | **Fiorella Estefania Solorzano de Peña** | 'active' | 36 | Facilidades Físicas | '+50583783108' | 2026-07-31 |
| '498ba88d...' | **German de Jesus Peña Soza** | 'active' | 47 | Facilidades Físicas | '+50583783108' | 2026-07-31 |

---

#### GRUPO #7 — Teléfono Normalizado: '+50577407948'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'ADULTO + MENOR', 'MISMO APELLIDO', 'POSIBLE FAMILIA'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **ALTA**)
- **Notas**: Adulto y menor de edad comparten número de contacto familiar.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| 'f61a8920...' | **Linda Regina Obando Ponce** | 'active' | 30 | Facilidades Físicas | '+50577407948' | 2026-07-31 |
| '57ba9ddd...' | **Angel Mosiah Sequeira Obando** | 'active' | 13 | Guía | '+50577407948' | 2026-07-31 |

---

#### GRUPO #9 — Teléfono Normalizado: '+50586704253'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'ADULTO + MENOR', 'MISMO APELLIDO', 'POSIBLE FAMILIA'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **ALTA**)
- **Notas**: Adulto y menor de edad comparten número de contacto familiar.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '58b4824a...' | **Fanny Auxiliadora Fonseca Romero** | 'active' | 14 | Guía | '+50586704253' | 2026-07-31 |
| 'd477963b...' | **Maria Auxiliadora Romero Roque** | 'active' | 40 | Guía | '+50586704253' | 2026-07-31 |

---

#### GRUPO #10 — Teléfono Normalizado: '+50589510000'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'MISMO APELLIDO', 'POSIBLE FAMILIA'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **ALTA**)
- **Notas**: Integrantes con apellidos coincidentes comparten teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '38de64f0...' | **Armado Jose Raudez Rivas** | 'active' | 30 | Guía | '+50589510000' | 2026-07-31 |
| 'ce6e77c7...' | **Olga Maria Gutierrez de Raudez** | 'active' | 31 | Guía | '+50589510000' | 2026-07-31 |

---

#### GRUPO #11 — Teléfono Normalizado: '+50582556314'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'RELACIÓN NO DETERMINABLE'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **MEDIA**)
- **Notas**: Perfiles activos con nombres distintos que comparten número de teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '09909812...' | **Franklin Antonio Henriquez Urbina** | 'active' | 37 | Guía | '+50582556314' | 2026-07-31 |
| 'f7d898d4...' | **Maritza Lorena Grarcia de Herinquez** | 'active' | 30 | Guía | '+50582556314' | 2026-07-31 |

---

#### GRUPO #12 — Teléfono Normalizado: '+50582866007'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'MISMO APELLIDO', 'POSIBLE FAMILIA'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **ALTA**)
- **Notas**: Integrantes con apellidos coincidentes comparten teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| 'bab08f7f...' | **Hosman Jose Garcia Barrios** | 'active' | 30 | Guía | '+50582866007' | 2026-07-31 |
| '79a42643...' | **Carlos Alexander Garcia Barrios** | 'active' | 22 | Guía | '+50582866007' | 2026-07-31 |

---

#### GRUPO #13 — Teléfono Normalizado: '+50586263843'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'RELACIÓN NO DETERMINABLE'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **MEDIA**)
- **Notas**: Perfiles activos con nombres distintos que comparten número de teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| 'c8cc7156...' | **Jorge Jesus Hernández** | 'active' | 52 | Guía | '+50586263843' | 2026-07-31 |
| '73af9bb3...' | **Janixia Benita Juárez** | 'active' | N/D | Guía | '+50586263843' | 2026-07-31 |

---

#### GRUPO #14 — Teléfono Normalizado: '+50587090011'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'RELACIÓN NO DETERMINABLE'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **MEDIA**)
- **Notas**: Perfiles activos con nombres distintos que comparten número de teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '8ab4a637...' | **Eduardo José torres romero** | 'active' | 63 | Guía | '+50587090011' | 2026-07-31 |
| '88e6f349...' | **Olga Marina Elvir** | 'active' | N/D | Guía | '+50587090011' | 2026-07-31 |

---

#### GRUPO #15 — Teléfono Normalizado: '+50557820614'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'RELACIÓN NO DETERMINABLE'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **MEDIA**)
- **Notas**: Perfiles activos con nombres distintos que comparten número de teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '3fa90547...' | **Gabriel Antonio Toledo Velasquez** | 'active' | 43 | Guía | '+50557820614' | 2026-07-31 |
| 'db8f08c4...' | **Harold Alcides Pinell Hernandez** | 'active' | N/D | Guía | '+50557820614' | 2026-07-31 |

---

#### GRUPO #16 — Teléfono Normalizado: '+50584051979'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'MISMO APELLIDO', 'POSIBLE FAMILIA'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **ALTA**)
- **Notas**: Integrantes con apellidos coincidentes comparten teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| 'c81ccdb1...' | **Francisco López** | 'active' | 64 | Guía | '+50584051979' | 2026-07-31 |
| '365cb353...' | **Francisca Labonte de López** | 'active' | 67 | Guía | '+50584051979' | 2026-07-31 |

---

#### GRUPO #17 — Teléfono Normalizado: '+50586157332'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'RELACIÓN NO DETERMINABLE'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **MEDIA**)
- **Notas**: Perfiles activos con nombres distintos que comparten número de teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '81daf57a...' | **Howard Thomas** | 'active' | 64 | Guía | '+50586157332' | 2026-07-31 |
| 'eb90124c...' | **Julia Gamboa Jonathan** | 'active' | 74 | Guía | '+50586157332' | 2026-07-31 |

---

#### GRUPO #18 — Teléfono Normalizado: '+50578433856'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'MISMO APELLIDO', 'POSIBLE FAMILIA'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **ALTA**)
- **Notas**: Integrantes con apellidos coincidentes comparten teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '7fc77173...' | **Alida Rosa Gutiérrez Espinoza de Roa** | 'active' | 67 | Guía | '+50578433856' | 2026-07-31 |
| 'afe433ec...' | **José Cristóbal Roa Lampi** | 'active' | 70 | Guía | '+50578433856' | 2026-07-31 |

---

#### GRUPO #19 — Teléfono Normalizado: '+50588787586'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'RELACIÓN NO DETERMINABLE'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **MEDIA**)
- **Notas**: Perfiles activos con nombres distintos que comparten número de teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '77a7978e...' | **Maria de la Cruz Solis solis** | 'active' | 73 | Guía | '+50588787586' | 2026-07-31 |
| '9739e006...' | **Dominga Maritza Velásquez Rivas** | 'active' | 69 | Guía | '+50588787586' | 2026-07-31 |

---

#### GRUPO #20 — Teléfono Normalizado: '+50585651630'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'RELACIÓN NO DETERMINABLE'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **MEDIA**)
- **Notas**: Perfiles activos con nombres distintos que comparten número de teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '02655091...' | **Juan Carlos Ruiz Sandino** | 'active' | 51 | Guía | '+50585651630' | 2026-07-31 |
| 'b5bd6096...' | **Carla Patricia Silva** | 'active' | 50 | Guía | '+50585651630' | 2026-07-31 |

---

#### GRUPO #21 — Teléfono Normalizado: '+50589308607'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'MISMO APELLIDO', 'POSIBLE FAMILIA'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **ALTA**)
- **Notas**: Integrantes con apellidos coincidentes comparten teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '3b9be7d9...' | **Silvia Elena Meneses Perez** | 'active' | N/D | Guía | '+50589308607' | 2026-07-31 |
| '3730b0d9...' | **Benjamín Ruiz Meneses** | 'active' | N/D | Guía | '+50589308607' | 2026-07-31 |

---

#### GRUPO #22 — Teléfono Normalizado: '+50578403793'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'MISMO APELLIDO', 'POSIBLE FAMILIA'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **ALTA**)
- **Notas**: Integrantes con apellidos coincidentes comparten teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '909a4eb7...' | **Alisson Nicole Maradiaga Acosta** | 'active' | 20 | Guía | '+50578403793' | 2026-07-31 |
| 'ca31e077...' | **Tifany Esther Maradiaga Acosta** | 'active' | 21 | Guía | '+50578403793' | 2026-07-31 |

---

#### GRUPO #23 — Teléfono Normalizado: '+50587823513'
- **Totales**: 6 Perfiles (6 Activos, 0 Archivados)
- **Etiquetas**: 'ADULTO + MENOR', 'MISMO APELLIDO', 'POSIBLE FAMILIA'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **ALTA**)
- **Notas**: Adulto y menor de edad comparten número de contacto familiar.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| 'f032c7d1...' | **Nahomi Paola Ampie Somarriba** | 'active' | 15 | Guía | '+50587823513' | 2026-07-31 |
| '0a3529eb...' | **Nataly del Pilar Ampie Somarriba** | 'active' | 17 | Guía | '+50587823513' | 2026-07-31 |
| '4d7fd9f8...' | **Winston Ivan Morales Blandon** | 'active' | 13 | Guía | '+50587823513' | 2026-07-31 |
| '6bf0be0f...' | **Matias Spencer Vanegas Blandon** | 'active' | 12 | Guía | '+50587823513' | 2026-07-31 |
| 'c5827f37...' | **Zoe de los Angeles Ampie Somarriiba** | 'active' | 12 | Guía | '+50587823513' | 2026-07-31 |
| '64aa3181...' | **Sheyla Patricia Blandón Somarriba** | 'active' | 41 | Recepción | '+50587823513' | 2026-08-07 |

---

#### GRUPO #24 — Teléfono Normalizado: '+50578003003'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'ADULTO + MENOR', 'MISMO APELLIDO', 'POSIBLE FAMILIA'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **ALTA**)
- **Notas**: Adulto y menor de edad comparten número de contacto familiar.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '80e38f21...' | **Oscar Bradley Ochoa Jimenez** | 'active' | 12 | Guía | '+50578003003' | 2026-07-31 |
| '627b93f9...' | **Oscar Danilo ochoa** | 'active' | 46 | Seguridad | '+50578003003' | 2026-08-04 |

---

#### GRUPO #25 — Teléfono Normalizado: '+50587727490'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'ADULTO + MENOR', 'MISMO APELLIDO', 'POSIBLE FAMILIA'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **ALTA**)
- **Notas**: Adulto y menor de edad comparten número de contacto familiar.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '3b65e88d...' | **Nohemy de los Angeles Salmeron Chevez** | 'active' | 15 | Guía | '+50587727490' | 2026-07-31 |
| '19771251...' | **Celsa Amparo Chevez Torrez de Salmeron** | 'active' | 43 | Guía | '+50587727490' | 2026-07-31 |

---

#### GRUPO #26 — Teléfono Normalizado: '+50578976493'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'CON MENORES', 'MISMO APELLIDO', 'POSIBLE FAMILIA'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **ALTA**)
- **Notas**: Integrantes con apellidos coincidentes comparten teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '814b1d80...' | **Marian Elizabeth Caceres Picado** | 'active' | 16 | Guía | '+50578976493' | 2026-07-31 |
| '119a7436...' | **Camila Mercedes Caceres Picado** | 'active' | 11 | Guía | '+50578976493' | 2026-07-31 |

---

#### GRUPO #27 — Teléfono Normalizado: '+50585293438'
- **Totales**: 3 Perfiles (3 Activos, 0 Archivados)
- **Etiquetas**: 'ADULTO + MENOR', 'MISMO APELLIDO', 'POSIBLE FAMILIA'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **ALTA**)
- **Notas**: Adulto y menor de edad comparten número de contacto familiar.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| 'db4b1551...' | **Raissa Mercado** | 'active' | 15 | Guía | '+50585293438' | 2026-07-31 |
| '89cf05da...' | **Monserrat Mercado** | 'active' | 15 | Guía | '+50585293438' | 2026-07-31 |
| 'a1cd977c...' | **Mercedes del Pilar Ordoñez** | 'active' | 37 | Parqueo y Transporte | '+50585293438' | 2026-08-07 |

---

#### GRUPO #28 — Teléfono Normalizado: '+50583391395'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'CON MENORES', 'RELACIÓN NO DETERMINABLE'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **ALTA**)
- **Notas**: Perfiles activos con nombres distintos que comparten número de teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| 'dff8f4c2...' | **Camila Arana** | 'active' | 15 | Guía | '+50583391395' | 2026-07-31 |
| 'f280e045...' | **Jessica Soza** | 'active' | 15 | Guía | '+50583391395' | 2026-07-31 |

---

#### GRUPO #29 — Teléfono Normalizado: '+50576890870'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'CON MENORES', 'MISMO APELLIDO', 'POSIBLE FAMILIA'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **ALTA**)
- **Notas**: Integrantes con apellidos coincidentes comparten teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '8e94f8d6...' | **Emma Gabrela Cruz Barea** | 'active' | 15 | Guía | '+50576890870' | 2026-07-31 |
| 'd329db3e...' | **William Gabriel Cruz Barea** | 'active' | 15 | Guía | '+50576890870' | 2026-07-31 |

---

#### GRUPO #30 — Teléfono Normalizado: '+50581984536'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'RELACIÓN NO DETERMINABLE'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **MEDIA**)
- **Notas**: Perfiles activos con nombres distintos que comparten número de teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '8edf6a50...' | **Arnaldo Rodriguez López** | 'active' | 27 | Guía | '+50581984536' | 2026-07-31 |
| '325014c0...' | **Bengi Alexander Hernanez Roy** | 'active' | 20 | Guía | '+50581984536' | 2026-07-31 |

---

#### GRUPO #31 — Teléfono Normalizado: '+50576109012'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'RELACIÓN NO DETERMINABLE'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **MEDIA**)
- **Notas**: Perfiles activos con nombres distintos que comparten número de teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| 'bc551420...' | **Jose Angel Arevalo Campos** | 'active' | 50 | Guía | '+50576109012' | 2026-07-31 |
| '50c2f998...' | **Marcia Marlene López** | 'active' | 49 | Guía | '+50576109012' | 2026-07-31 |

---

#### GRUPO #32 — Teléfono Normalizado: '+50578256837'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'RELACIÓN NO DETERMINABLE'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **MEDIA**)
- **Notas**: Perfiles activos con nombres distintos que comparten número de teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '3bc27660...' | **Mario José López** | 'active' | 66 | Guía | '+50578256837' | 2026-07-31 |
| 'dd37180e...' | **Argentina del Socorro Contreras** | 'active' | 62 | Guía | '+50578256837' | 2026-07-31 |

---

#### GRUPO #33 — Teléfono Normalizado: '+50581233738'
- **Totales**: 3 Perfiles (3 Activos, 0 Archivados)
- **Etiquetas**: 'ADULTO + MENOR', 'MISMO APELLIDO', 'POSIBLE FAMILIA'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **ALTA**)
- **Notas**: Adulto y menor de edad comparten número de contacto familiar.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '16744c32...' | **Silma Herenia De Coronado Chavarria** | 'active' | 36 | Guía | '+50581233738' | 2026-07-31 |
| 'a258fc80...' | **Ericka Camila Coronado Chavarria** | 'active' | 14 | Guía | '+50581233738' | 2026-07-31 |
| '0cdea6a8...' | **Sarah Anali Chavarria Salinas** | 'active' | 12 | Guía | '+50581233738' | 2026-07-31 |

---

#### GRUPO #34 — Teléfono Normalizado: '+50557855141'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'RELACIÓN NO DETERMINABLE'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **MEDIA**)
- **Notas**: Perfiles activos con nombres distintos que comparten número de teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '7ce12d26...' | **Rebeca Judith Galan** | 'active' | 37 | Guía | '+50557855141' | 2026-07-31 |
| '1fe51eb2...' | **Jose Antonio Osejo Ibarra** | 'active' | 41 | Guía | '+50557855141' | 2026-07-31 |

---

#### GRUPO #35 — Teléfono Normalizado: '+50584205496'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'MISMO APELLIDO', 'POSIBLE FAMILIA'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **ALTA**)
- **Notas**: Integrantes con apellidos coincidentes comparten teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '5c195df6...' | **Noel Gómez López** | 'active' | 67 | Guía | '+50584205496' | 2026-07-31 |
| '7fb1d085...' | **Yolanda Gómez** | 'active' | 77 | Guía | '+50584205496' | 2026-07-31 |

---

#### GRUPO #36 — Teléfono Normalizado: '+50558325158'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'RELACIÓN NO DETERMINABLE'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **MEDIA**)
- **Notas**: Perfiles activos con nombres distintos que comparten número de teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '247c0a87...' | **Kenia Victoria Paramo Torrez** | 'active' | 32 | Guía | '+50558325158' | 2026-07-31 |
| '2a70d212...' | **Jordan Alexander Vanegas Rayo** | 'active' | 33 | Guía | '+50558325158' | 2026-07-31 |

---

#### GRUPO #37 — Teléfono Normalizado: '+50587671717'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'RELACIÓN NO DETERMINABLE'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **MEDIA**)
- **Notas**: Perfiles activos con nombres distintos que comparten número de teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| 'c6d19704...' | **Francisco José Largaespada Sobalvarro** | 'active' | 75 | Guía | '+50587671717' | 2026-07-31 |
| 'a2697df6...' | **Elisa Amanda Hernández Pérez** | 'active' | 64 | Guía | '+50587671717' | 2026-07-31 |

---

#### GRUPO #39 — Teléfono Normalizado: '+50581921394'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'MISMO APELLIDO', 'POSIBLE FAMILIA'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **ALTA**)
- **Notas**: Integrantes con apellidos coincidentes comparten teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| 'a8e5a7a3...' | **Lenin Ramírez Madriz** | 'active' | 47 | Guía | '+50581921394' | 2026-07-31 |
| 'cd7a40e0...' | **Martha Leonor López de Ramírez** | 'active' | 46 | Guía | '+50581921394' | 2026-07-31 |

---

#### GRUPO #40 — Teléfono Normalizado: '+50584572080'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'MISMO APELLIDO', 'POSIBLE FAMILIA'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **ALTA**)
- **Notas**: Integrantes con apellidos coincidentes comparten teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| 'db27d157...' | **Walter Cerda Cruz** | 'active' | 64 | Guía | '+50584572080' | 2026-07-31 |
| 'a6670c49...' | **Migdonia de Jesus Centeno de Cerda** | 'active' | 63 | Guía | '+50584572080' | 2026-07-31 |

---

#### GRUPO #42 — Teléfono Normalizado: '+50577977321'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'RELACIÓN NO DETERMINABLE'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **MEDIA**)
- **Notas**: Perfiles activos con nombres distintos que comparten número de teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| 'f6d53f0f...' | **Ericka Maria Lopez de Jimenez** | 'active' | 44 | Seguridad | '+50577977321' | 2026-08-01 |
| 'b75ba851...' | **Freddy Alfonso Cruz Flores** | 'active' | 66 | Sin comité | '+50577977321' | 2026-08-01 |

---

#### GRUPO #43 — Teléfono Normalizado: '+50586191864'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'RELACIÓN NO DETERMINABLE'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **MEDIA**)
- **Notas**: Perfiles activos con nombres distintos que comparten número de teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '582734e1...' | **Geoconda de los Angeles Olivares Silva** | 'active' | 46 | Seguridad | '+50586191864' | 2026-08-01 |
| '8e9cf31d...' | **Haronyd Daniela Hernández Dávila** | 'active' | 21 | Seguridad | '+50586191864' | 2026-08-02 |

---

#### GRUPO #44 — Teléfono Normalizado: '+50588541704'
- **Totales**: 3 Perfiles (3 Activos, 0 Archivados)
- **Etiquetas**: 'RELACIÓN NO DETERMINABLE'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **MEDIA**)
- **Notas**: Perfiles activos con nombres distintos que comparten número de teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '283f445d...' | **Ian Andre Guzman Gonzalez** | 'active' | 20 | Seguridad | '+50588541704' | 2026-08-01 |
| 'a9643fcd...' | **Ivania Ulloa Baca** | 'active' | 47 | Seguridad | '+50588541704' | 2026-08-02 |
| '10b12e8b...' | **Ivania Aristhomene** | 'active' | 47 | Seguridad | '+50588541704' | 2026-08-03 |

---

#### GRUPO #46 — Teléfono Normalizado: '+50583760752'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'RELACIÓN NO DETERMINABLE'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **MEDIA**)
- **Notas**: Perfiles activos con nombres distintos que comparten número de teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '0627885d...' | **Jennyfer del Carmen López Briceño** | 'active' | 21 | Seguridad | '+50583760752' | 2026-08-01 |
| '54964c35...' | **José Luis Gaitán** | 'active' | 26 | Seguridad | '+50583760752' | 2026-08-01 |

---

#### GRUPO #47 — Teléfono Normalizado: '+50581211377'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'RELACIÓN NO DETERMINABLE'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **MEDIA**)
- **Notas**: Perfiles activos con nombres distintos que comparten número de teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| 'ff6be90f...' | **Jorge Alberto Pilarte Gutierrez** | 'active' | 42 | Seguridad | '+50581211377' | 2026-08-01 |
| '4ed1cf64...' | **Kenneth Danilo Centeno Ruiz** | 'active' | 26 | Seguridad | '+50581211377' | 2026-08-01 |

---

#### GRUPO #48 — Teléfono Normalizado: '+50587713398'
- **Totales**: 3 Perfiles (3 Activos, 0 Archivados)
- **Etiquetas**: 'MISMO APELLIDO', 'POSIBLE FAMILIA'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **ALTA**)
- **Notas**: Integrantes con apellidos coincidentes comparten teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '09170620...' | **Mario Alberto Jimenez Lopez** | 'active' | 43 | Seguridad | '+50587713398' | 2026-08-01 |
| '2c88bc6d...' | **Martha Carolina González Lacayo** | 'active' | 50 | Seguridad | '+50587713398' | 2026-08-02 |
| 'ed02a044...' | **Carolina Gonzalez** | 'active' | 51 | Seguridad | '+50587713398' | 2026-08-03 |

---

#### GRUPO #49 — Teléfono Normalizado: '+50586965155'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'FORMATO DISTINTO', 'RELACIÓN NO DETERMINABLE'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **MEDIA**)
- **Notas**: Perfiles activos con nombres distintos que comparten número de teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| 'f608dccc...' | **Mirna Mireya Mendoza de Bravo** | 'active' | 46 | Seguridad | '+50586965155' | 2026-08-01 |
| '61bede17...' | **Nadia Camila Davila de Mejia** | 'active' | 26 | Seguridad | '86965155' | 2026-08-01 |

---

#### GRUPO #50 — Teléfono Normalizado: '+50581646206'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'MISMO APELLIDO', 'POSIBLE FAMILIA'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **ALTA**)
- **Notas**: Integrantes con apellidos coincidentes comparten teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| 'a85fba9c...' | **Paola Martinez Cruz** | 'active' | 26 | Seguridad | '+50581646206' | 2026-08-01 |
| '0aca930b...' | **Paola Lillieth Martinez Cruz** | 'active' | 27 | Seguridad | '+50581646206' | 2026-08-04 |

---

#### GRUPO #52 — Teléfono Normalizado: '+50586499496'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'MISMO APELLIDO', 'POSIBLE FAMILIA'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **ALTA**)
- **Notas**: Integrantes con apellidos coincidentes comparten teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '87472c91...' | **Silvano Roberto García cruz** | 'active' | 65 | Seguridad | '+50586499496' | 2026-08-02 |
| '3f9c5b27...' | **Roberto García Cruz** | 'active' | 65 | Seguridad | '+50586499496' | 2026-08-02 |

---

#### GRUPO #57 — Teléfono Normalizado: '+50584363933'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'MISMO APELLIDO', 'POSIBLE FAMILIA'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **ALTA**)
- **Notas**: Integrantes con apellidos coincidentes comparten teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '60909675...' | **Camila Salazar** | 'active' | 28 | Parqueo y Transporte | '+50584363933' | 2026-08-03 |
| 'f2c5361d...' | **Victor Salazar** | 'active' | 25 | Parqueo y Transporte | '+50584363933' | 2026-08-03 |

---

#### GRUPO #58 — Teléfono Normalizado: '+50589005590'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'RELACIÓN NO DETERMINABLE'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **MEDIA**)
- **Notas**: Perfiles activos con nombres distintos que comparten número de teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| 'e23ded61...' | **José María Mercado** | 'active' | 40 | Parqueo y Transporte | '+50589005590' | 2026-08-03 |
| 'e816e427...' | **Juan Rivera Benavides** | 'active' | 50 | Parqueo y Transporte | '+50589005590' | 2026-08-03 |

---

#### GRUPO #59 — Teléfono Normalizado: '+50588714650'
- **Totales**: 2 Perfiles (2 Activos, 0 Archivados)
- **Etiquetas**: 'RELACIÓN NO DETERMINABLE'
- **Acción Recomendada**: 'MARCAR COMO SHARED_PHONE' (Confianza: **MEDIA**)
- **Notas**: Perfiles activos con nombres distintos que comparten número de teléfono.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '54b5b3d6...' | **Sayda Raquel Rubio de Gonzalez** | 'active' | 47 | Parqueo y Transporte | '+50588714650' | 2026-08-03 |
| 'f3f4508d...' | **Yara Francel Rocha Velásquez** | 'active' | 29 | Parqueo y Transporte | '+50588714650' | 2026-08-03 |

---

### CATEGORY C — Diferencias de Formato de Teléfono (0 Grupos)

*No se registraron grupos en esta categoría.*

### CATEGORY D — Voluntarios Archivados (3 Grupos)

#### GRUPO #41 — Teléfono Normalizado: '+50557062212'
- **Totales**: 2 Perfiles (1 Activos, 1 Archivados)
- **Etiquetas**: 'MISMO APELLIDO', 'TIENE ARCHIVADOS'
- **Acción Recomendada**: 'NORMALIZAR FORMATO' (Confianza: **ALTA**)
- **Notas**: Existe al menos un perfil archivado. El teléfono activo conserva preferencia.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '05c4d83c...' | **Danny Andrés Lay Torrez** | 'active' | 33 | Tecnología | '+50557062212' | 2026-08-01 |
| '387c4a70...' | **Danny Lay De Marín** | 'archived' | 33 | Tecnología | '+50557062212' | 2026-08-05 |

---

#### GRUPO #51 — Teléfono Normalizado: '+50581548563'
- **Totales**: 2 Perfiles (1 Activos, 1 Archivados)
- **Etiquetas**: 'MISMO APELLIDO', 'TIENE ARCHIVADOS'
- **Acción Recomendada**: 'NORMALIZAR FORMATO' (Confianza: **ALTA**)
- **Notas**: Existe al menos un perfil archivado. El teléfono activo conserva preferencia.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '3cb35b78...' | **Mercedes Yamilett Diaz Umaña** | 'active' | 60 | Seguridad | '+50581548563' | 2026-08-02 |
| 'ce7149a5...' | **Yamileth Diaz** | 'archived' | 26 | Seguridad | '+50581548563' | 2026-08-04 |

---

#### GRUPO #55 — Teléfono Normalizado: '+50583279246'
- **Totales**: 2 Perfiles (1 Activos, 1 Archivados)
- **Etiquetas**: 'NOMBRES IDÉNTICOS', 'MISMO APELLIDO', 'TIENE ARCHIVADOS'
- **Acción Recomendada**: 'NORMALIZAR FORMATO' (Confianza: **ALTA**)
- **Notas**: Existe al menos un perfil archivado. El teléfono activo conserva preferencia.

| ID Voluntario | Nombre Completo | Status | Edad | Comité | Teléfono Original | Creado |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| '40c7b9c8...' | **Alejandro José Silva Vargas** | 'active' | 38 | Seguridad | '+50583279246' | 2026-08-02 |
| '69c29a83...' | **Alejandro José Silva Vargas** | 'archived' | N/D | Seguridad | '+50583279246' | 2026-08-02 |

---

### CATEGORY E — Casos Ambiguos / Revisión Manual (0 Grupos)

*No se registraron grupos en esta categoría.*

## 4. TABLA DE DECISIÓN Y MATRIZ DE REVISIÓN ADMINISTRATIVA

| Grupo | Teléfono | Activos | Archivados | Categoría Sugerida | Confianza | Acción Requerida |
| :---: | :---: | :---: | :---: | :--- | :---: | :--- |
| **#1** | '+50557081704' | 2 | 0 | **CATEGORY_A** | ALTA | 'ARCHIVAR DUPLICADO' |
| **#2** | '+50576096922' | 2 | 0 | **CATEGORY_B** | ALTA | 'MARCAR COMO SHARED_PHONE' |
| **#3** | '+50581406969' | 2 | 0 | **CATEGORY_B** | ALTA | 'MARCAR COMO SHARED_PHONE' |
| **#4** | '+50581417825' | 2 | 0 | **CATEGORY_B** | ALTA | 'MARCAR COMO SHARED_PHONE' |
| **#5** | '+50588688069' | 2 | 0 | **CATEGORY_B** | ALTA | 'MARCAR COMO SHARED_PHONE' |
| **#6** | '+50583783108' | 2 | 0 | **CATEGORY_B** | ALTA | 'MARCAR COMO SHARED_PHONE' |
| **#7** | '+50577407948' | 2 | 0 | **CATEGORY_B** | ALTA | 'MARCAR COMO SHARED_PHONE' |
| **#8** | '+50588328115' | 2 | 0 | **CATEGORY_A** | ALTA | 'ARCHIVAR DUPLICADO' |
| **#9** | '+50586704253' | 2 | 0 | **CATEGORY_B** | ALTA | 'MARCAR COMO SHARED_PHONE' |
| **#10** | '+50589510000' | 2 | 0 | **CATEGORY_B** | ALTA | 'MARCAR COMO SHARED_PHONE' |
| **#11** | '+50582556314' | 2 | 0 | **CATEGORY_B** | MEDIA | 'MARCAR COMO SHARED_PHONE' |
| **#12** | '+50582866007' | 2 | 0 | **CATEGORY_B** | ALTA | 'MARCAR COMO SHARED_PHONE' |
| **#13** | '+50586263843' | 2 | 0 | **CATEGORY_B** | MEDIA | 'MARCAR COMO SHARED_PHONE' |
| **#14** | '+50587090011' | 2 | 0 | **CATEGORY_B** | MEDIA | 'MARCAR COMO SHARED_PHONE' |
| **#15** | '+50557820614' | 2 | 0 | **CATEGORY_B** | MEDIA | 'MARCAR COMO SHARED_PHONE' |
| **#16** | '+50584051979' | 2 | 0 | **CATEGORY_B** | ALTA | 'MARCAR COMO SHARED_PHONE' |
| **#17** | '+50586157332' | 2 | 0 | **CATEGORY_B** | MEDIA | 'MARCAR COMO SHARED_PHONE' |
| **#18** | '+50578433856' | 2 | 0 | **CATEGORY_B** | ALTA | 'MARCAR COMO SHARED_PHONE' |
| **#19** | '+50588787586' | 2 | 0 | **CATEGORY_B** | MEDIA | 'MARCAR COMO SHARED_PHONE' |
| **#20** | '+50585651630' | 2 | 0 | **CATEGORY_B** | MEDIA | 'MARCAR COMO SHARED_PHONE' |
| **#21** | '+50589308607' | 2 | 0 | **CATEGORY_B** | ALTA | 'MARCAR COMO SHARED_PHONE' |
| **#22** | '+50578403793' | 2 | 0 | **CATEGORY_B** | ALTA | 'MARCAR COMO SHARED_PHONE' |
| **#23** | '+50587823513' | 6 | 0 | **CATEGORY_B** | ALTA | 'MARCAR COMO SHARED_PHONE' |
| **#24** | '+50578003003' | 2 | 0 | **CATEGORY_B** | ALTA | 'MARCAR COMO SHARED_PHONE' |
| **#25** | '+50587727490' | 2 | 0 | **CATEGORY_B** | ALTA | 'MARCAR COMO SHARED_PHONE' |
| **#26** | '+50578976493' | 2 | 0 | **CATEGORY_B** | ALTA | 'MARCAR COMO SHARED_PHONE' |
| **#27** | '+50585293438' | 3 | 0 | **CATEGORY_B** | ALTA | 'MARCAR COMO SHARED_PHONE' |
| **#28** | '+50583391395' | 2 | 0 | **CATEGORY_B** | ALTA | 'MARCAR COMO SHARED_PHONE' |
| **#29** | '+50576890870' | 2 | 0 | **CATEGORY_B** | ALTA | 'MARCAR COMO SHARED_PHONE' |
| **#30** | '+50581984536' | 2 | 0 | **CATEGORY_B** | MEDIA | 'MARCAR COMO SHARED_PHONE' |
| **#31** | '+50576109012' | 2 | 0 | **CATEGORY_B** | MEDIA | 'MARCAR COMO SHARED_PHONE' |
| **#32** | '+50578256837' | 2 | 0 | **CATEGORY_B** | MEDIA | 'MARCAR COMO SHARED_PHONE' |
| **#33** | '+50581233738' | 3 | 0 | **CATEGORY_B** | ALTA | 'MARCAR COMO SHARED_PHONE' |
| **#34** | '+50557855141' | 2 | 0 | **CATEGORY_B** | MEDIA | 'MARCAR COMO SHARED_PHONE' |
| **#35** | '+50584205496' | 2 | 0 | **CATEGORY_B** | ALTA | 'MARCAR COMO SHARED_PHONE' |
| **#36** | '+50558325158' | 2 | 0 | **CATEGORY_B** | MEDIA | 'MARCAR COMO SHARED_PHONE' |
| **#37** | '+50587671717' | 2 | 0 | **CATEGORY_B** | MEDIA | 'MARCAR COMO SHARED_PHONE' |
| **#38** | '+50582384685' | 2 | 0 | **CATEGORY_A** | ALTA | 'ARCHIVAR DUPLICADO' |
| **#39** | '+50581921394' | 2 | 0 | **CATEGORY_B** | ALTA | 'MARCAR COMO SHARED_PHONE' |
| **#40** | '+50584572080' | 2 | 0 | **CATEGORY_B** | ALTA | 'MARCAR COMO SHARED_PHONE' |
| **#41** | '+50557062212' | 1 | 1 | **CATEGORY_D** | ALTA | 'NORMALIZAR FORMATO' |
| **#42** | '+50577977321' | 2 | 0 | **CATEGORY_B** | MEDIA | 'MARCAR COMO SHARED_PHONE' |
| **#43** | '+50586191864' | 2 | 0 | **CATEGORY_B** | MEDIA | 'MARCAR COMO SHARED_PHONE' |
| **#44** | '+50588541704' | 3 | 0 | **CATEGORY_B** | MEDIA | 'MARCAR COMO SHARED_PHONE' |
| **#45** | '+50588546327' | 2 | 1 | **CATEGORY_A** | ALTA | 'ARCHIVAR DUPLICADO' |
| **#46** | '+50583760752' | 2 | 0 | **CATEGORY_B** | MEDIA | 'MARCAR COMO SHARED_PHONE' |
| **#47** | '+50581211377' | 2 | 0 | **CATEGORY_B** | MEDIA | 'MARCAR COMO SHARED_PHONE' |
| **#48** | '+50587713398' | 3 | 0 | **CATEGORY_B** | ALTA | 'MARCAR COMO SHARED_PHONE' |
| **#49** | '+50586965155' | 2 | 0 | **CATEGORY_B** | MEDIA | 'MARCAR COMO SHARED_PHONE' |
| **#50** | '+50581646206' | 2 | 0 | **CATEGORY_B** | ALTA | 'MARCAR COMO SHARED_PHONE' |
| **#51** | '+50581548563' | 1 | 1 | **CATEGORY_D** | ALTA | 'NORMALIZAR FORMATO' |
| **#52** | '+50586499496' | 2 | 0 | **CATEGORY_B** | ALTA | 'MARCAR COMO SHARED_PHONE' |
| **#53** | '+50576739821' | 2 | 0 | **CATEGORY_A** | ALTA | 'ARCHIVAR DUPLICADO' |
| **#54** | '+50585857058' | 3 | 0 | **CATEGORY_A** | ALTA | 'ARCHIVAR DUPLICADO' |
| **#55** | '+50583279246' | 1 | 1 | **CATEGORY_D** | ALTA | 'NORMALIZAR FORMATO' |
| **#56** | '+50587961377' | 2 | 0 | **CATEGORY_A** | ALTA | 'ARCHIVAR DUPLICADO' |
| **#57** | '+50584363933' | 2 | 0 | **CATEGORY_B** | ALTA | 'MARCAR COMO SHARED_PHONE' |
| **#58** | '+50589005590' | 2 | 0 | **CATEGORY_B** | MEDIA | 'MARCAR COMO SHARED_PHONE' |
| **#59** | '+50588714650' | 2 | 0 | **CATEGORY_B** | MEDIA | 'MARCAR COMO SHARED_PHONE' |


---
*Reporte generado de forma 100% READ-ONLY por VolunteerManager Phase 3 Diagnostic Script.*
