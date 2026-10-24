# REQUIREMENTS.md — SmartStock WMS (Demo)

> เอกสารตีโจทย์ฉบับเต็ม เป็นแหล่งความจริงเดียวของโปรเจกต์ ใช้เป็นแกนของทั้ง Prototype และ Canva Presentation
> ชื่อ "SmartStock WMS" เป็นชื่อสมมติเพื่อการนำเสนอ ไม่ใช่ชื่อบริษัทลูกค้า

---

## 1. Context & Goal

บริษัทมีคลังสินค้าขนาดกลาง ปัจจุบันเจอปัญหา 5 ข้อ (จากโจทย์):

1. เช็ก Stock ต้องเปิด Excel หลายไฟล์
2. ไม่รู้ Stock แบบ Real-time
3. พนักงานหยิบของผิด / หาของไม่เจอ
4. ผู้จัดการคลังไม่เห็นภาพรวมการทำงาน
5. ไม่มีข้อมูลช่วยตัดสินใจล่วงหน้า

**เป้าหมาย:** ออกแนวคิด WMS ใหม่ ตั้งแต่ความต้องการทางธุรกิจ → หน้าจอระบบ → แนวคิด AI โดยเน้นความชัดเจนของวิธีคิด, business logic และความเป็นไปได้จริง ไม่เน้นความสวยสมบูรณ์

**สิ่งที่ต้องส่ง:** (1) UI Prototype ที่ deploy แล้ว (2) Canva Presentation 8–12 สไลด์ กำหนดส่ง 25/10/2026

---

## 2. Assumptions (ต้องใส่ในสไลด์)

| # | สมมติฐาน |
|---|---|
| A1 | คลังเดียว (single warehouse) ขนาดกลาง ของจริงสมมติ ~2,000 SKU, Prototype ใช้ ~40 SKU |
| A2 | พนักงานคลัง ~10–20 คน แบ่งเป็น Picker, Receiver, Manager (+ Admin) |
| A3 | รหัสตำแหน่งจัดเก็บแบบ `Zone-Aisle-Rack-Level` เช่น `A-02-03-1` |
| A4 | ปัจจุบันยังไม่มี barcode scanner ใน Prototype จำลองการสแกนด้วยการพิมพ์/กดยืนยัน SKU |
| A5 | ข้อมูลทั้งหมดเป็นข้อมูลจำลอง (mock) เก็บใน store กลางฝั่ง browser + localStorage ไม่มี backend/DB จริง |
| A6 | ตัด stock (on-hand) เมื่อ Picker ยืนยันการหยิบ ไม่ทำ stock reservation ใน Prototype |
| A7 | AI เป็นแนวคิด ใช้กฎง่าย ๆ คำนวณจากข้อมูลใน store ไม่ใช่โมเดล ML จริง และไม่อ้างความแม่นยำ |
| A8 | ภาษาหน้าจอ: อังกฤษ (ข้อมูลตัวอย่างใช้สินค้าทั่วไปในคลังไทย) — ปรับได้ |
| A9 | Location จำลองมี capacity และระยะ/พิกัดจาก dispatch point เพื่อใช้แนะนำตำแหน่งและเรียงเส้นทางหยิบ |

**คำถามที่จะถามลูกค้าจริงก่อนเริ่มงาน** (ใส่ไว้ท้ายสไลด์): มีกี่ SKU / กี่คลัง? ใช้ barcode หรือ RFID อยู่ไหม? ใช้ระบบบัญชี/ERP อะไร? รอบเติมสินค้าและ lead time ของ supplier เป็นอย่างไร? ใช้ FIFO/FEFO ไหม? มี order กี่รายการต่อวัน และช่วงพีคเมื่อไหร่?

---

## 3. อาการ → สาเหตุ

| อาการ (จากโจทย์) | สาเหตุที่น่าจะเป็น |
|---|---|
| เช็ก Stock ต้องเปิด Excel หลายไฟล์ | ไม่มีแหล่งข้อมูลกลาง (single source of truth) |
| ไม่รู้ Stock แบบ Real-time | ยอดไม่ได้อัปเดตทุกครั้งที่สินค้าเคลื่อนไหว |
| หยิบผิด / หาของไม่เจอ | ตำแหน่งจัดเก็บไม่ชัดเจน และไม่มีขั้นตอนยืนยันตอนหยิบ |
| ผู้จัดการไม่เห็นภาพรวม | ไม่มีใครสรุปข้อมูลให้ในที่เดียว |
| ไม่มีข้อมูลช่วยตัดสินใจล่วงหน้า | ทำงานแบบตามแก้ปัญหา ไม่ได้ใช้ข้อมูลย้อนหลังมาคาดการณ์ |

---

## 4. Users & Roles

| Role | ต้องการอะไร | เมนูที่เห็น |
|---|---|---|
| **Picker** (พนักงานหยิบ) | รู้ว่าหยิบอะไร ที่ไหน กี่ชิ้น และยืนยันได้ง่ายบนมือถือ | Orders & Picking, Inventory (อ่านอย่างเดียว) |
| **Receiver** (พนักงานรับสินค้า) | บันทึกของเข้า ระบุตำแหน่งเก็บ | Receiving, Inventory (อ่านอย่างเดียว) |
| **Manager** (ผู้จัดการคลัง) | เห็นภาพรวม ปัญหาเร่งด่วน คำแนะนำ ตรวจสอบย้อนหลัง | ทุกเมนู ยกเว้น Users & Roles |
| **Admin** | จัดการผู้ใช้และการตั้งค่า | ทุกเมนู |

Login แบบ Demo Access: กรอก credential อะไรก็ได้ แล้ว**เลือก Role** เพื่อสาธิตเมนูที่ต่างกัน. Dashboard ซ่อนจาก Picker และ Receiver. หลัง Login ให้ไปหน้าแรกตาม Role: Picker → Orders & Picking, Receiver → Receiving, Manager/Admin → Dashboard. หากเปิด URL ที่ไม่มีสิทธิ์ ให้ redirect กลับหน้าแรกของ Role นั้น

---

## 5. Traceability Matrix (แกนของงานนี้)

**ปัญหา → Business Requirement → Feature → หน้าจอ → KPI**

| ID | ปัญหา | Business Requirement | Feature | หน้าจอ | KPI |
|---|---|---|---|---|---|
| BR-01 | Excel หลายไฟล์ | ผู้ใช้ตรวจสอบสต็อกจากแหล่งข้อมูลกลางแหล่งเดียวได้ | ตาราง Inventory, Search, Filter, Product Detail | Inventory | เวลาเฉลี่ยในการหาข้อมูลสต็อก, Inventory Accuracy |
| BR-02 | ไม่ Real-time | ยอดคงเหลืออัปเดตทุกครั้งที่รับเข้า/หยิบออก/ปรับยอด และตรวจย้อนหลังได้ | Receiving, Picking confirm, Stock Adjustment, Movement log | Receiving, Orders & Picking, Stock Adjustment, Stock Movements | Inventory Accuracy |
| BR-03 | หยิบผิด / หาของไม่เจอ | Picker รู้ว่าหยิบอะไร ที่ไหน กี่ชิ้น และต้องยืนยันก่อนปิดงาน | Pick list เรียงตามตำแหน่ง, Picking Validation (SKU/ตำแหน่ง/จำนวน), บล็อกเมื่อไม่ตรง | Orders & Picking | Picking Error Rate, Order Fulfillment Time |
| BR-04 | ผู้จัดการไม่เห็นภาพรวม | ผู้จัดการเห็นสถานะคลังและเรื่องเร่งด่วนในหน้าเดียว | KPI cards, กราฟสถานะงาน, รายการเร่งด่วน | Dashboard | เวลาที่ผู้จัดการใช้รวบรวมภาพรวม |
| BR-05 | ไม่มีข้อมูลล่วงหน้า | ผู้จัดการได้คำแนะนำพร้อมเหตุผล ก่อนปัญหาเกิด | Stockout Prediction, Manager Summary, Location Recommendation, Picking Route | AI Insights | Stockout Rate |
| BR-06 | สินค้าใกล้หมดไม่มีใครรู้ | ระบบแจ้งเตือนเมื่อสต็อกถึงจุดสั่งซื้อขั้นต่ำ | Reorder point, สถานะ Low/Critical/Out, Notification bell | Topbar, Dashboard, Inventory, Settings | Stockout Rate |
| BR-07 | (รองรับการเติบโต) | แต่ละบทบาทเห็นและทำได้เฉพาะงานของตน | Role-based menu, Users & Roles | ทุกหน้า, Users & Roles | — |
| BR-08 | (การรายงาน) | ผู้จัดการนำข้อมูลไปรายงานต่อได้ | Export CSV (Inventory, Movements) | Reports | — |

หลักการเพิ่มฟีเจอร์: **ทุกฟีเจอร์ต้องชี้กลับไปที่ BR ได้อย่างน้อย 1 ข้อ** ถ้าชี้ไม่ได้ ให้ตัดออก

---

## 6. หน้าจอและเมนู

**Login** (อยู่นอก Sidebar)

**Sidebar:**

| หมวด | เมนู |
|---|---|
| (บนสุด) | Dashboard |
| MAIN | Inventory, Receiving, Orders & Picking, Stock Movements, Stock Adjustment |
| EXPLORE | AI Insights, Reports, Users & Roles, Settings |
| (ล่างสุด) | Light/Dark toggle, Log Out |

### 6.1 Login
- การ์ดกลางจอ บนพื้นหลังไล่สีฟ้า, โลโก้ + ชื่อระบบ, Username, Password (มีปุ่มแสดง/ซ่อน), ปุ่ม Sign In
- ข้อความ "Demo Access: use any credentials to continue"
- ตัวเลือกเลือก Role (Picker / Receiver / Manager / Admin)
- **AC:** กรอกอะไรก็เข้าได้ และ Role ที่เลือกกำหนดเมนูใน Sidebar
- **AC:** Login แล้วไปหน้าแรกตาม Role; Dashboard ไม่แสดงในเมนู Picker/Receiver; การเข้าถึง URL ที่ไม่มีสิทธิ์ redirect กลับหน้าแรกของ Role

### 6.2 Dashboard (BR-04, BR-06)
- KPI cards: Total SKU, Low-stock items, Pending orders, Picking completed today
- กราฟสถานะงาน (Pending / In Progress / Completed), รายการสต็อกวิกฤต, Order ที่ใกล้เลยกำหนด, กิจกรรมล่าสุด (จาก Movements)
- **AC:** ตัวเลขทุกตัวคำนวณจาก store (ห้าม hardcode) และเปลี่ยนทันทีเมื่อมีการรับเข้า/หยิบออก

### 6.3 Inventory (BR-01, BR-06)
- ตาราง: SKU, ชื่อสินค้า, หมวด, On-hand, ตำแหน่ง, Reorder point, สถานะ (Normal / Low / Critical / Out)
- Search (SKU/ชื่อ), Filter (หมวด, สถานะ, Zone), Sort
- Product Detail (drawer หรือหน้า): ข้อมูลสินค้า, ตำแหน่ง, Reorder point, Lead time, ประวัติ Movement ของ SKU นั้น
- **AC:** ค้นหา/กรองได้, สีสถานะถูกต้องตามกฎข้อ 8, คลิก SKU เห็นรายละเอียดและประวัติ

### 6.4 Receiving (BR-02)
- ฟอร์มรับสินค้าเข้า: เลือก SKU, จำนวน, ตำแหน่งปลายทาง (มีคำแนะนำจาก AI Location Recommendation), เลขอ้างอิง (optional), หมายเหตุ
- **AC:** บันทึกแล้ว On-hand เพิ่มตามจำนวน และเกิด Movement ประเภท RECEIVE

### 6.5 Orders & Picking (BR-03)
- รายการ Order (Pending / In Progress / Completed) พร้อม filter
- เปิด Order → Pick list เรียงตามตำแหน่ง: SKU, ชื่อ, ตำแหน่ง, จำนวนที่ต้องหยิบ, จำนวนที่หยิบแล้ว
- **Picking Validation:** ให้กรอก/จำลองสแกน SKU และยืนยันจำนวน ถ้า SKU ไม่ตรง ให้แสดง error และห้ามยืนยัน ถ้าจำนวนไม่ครบ ให้เลือก "หยิบไม่ครบ" พร้อมเหตุผล
- ปุ่ม "Start Picking" เปลี่ยนสถานะเป็น In Progress, เมื่อทุกบรรทัดครบ → Completed
- หน้านี้ต้องใช้บนมือถือได้ (ปุ่มใหญ่, อ่านง่าย)
- **AC:** ยืนยันหยิบ 5 ชิ้น → On-hand ลด 5 และเกิด Movement ประเภท PICK อ้างอิง Order นั้น; หยิบเกินสต็อกที่มีไม่ได้

### 6.6 Stock Movements (BR-02)
- ตาราง audit log: เวลา, ประเภท (RECEIVE / PICK / ADJUST), SKU, จำนวน (+/-), ก่อน → หลัง, ตำแหน่ง, ผู้ทำรายการ, อ้างอิง/เหตุผล
- Filter: วันที่, ประเภท, SKU, ผู้ทำรายการ
- **AC:** ทุกการเปลี่ยนแปลงสต็อกต้องปรากฏที่นี่ และยอด before/after ต่อเนื่องกัน

### 6.7 Stock Adjustment (BR-02)
- ฟอร์มปรับยอดจากการตรวจนับ: เลือก SKU, ยอดในระบบ, ยอดที่นับได้, ส่วนต่าง, **เหตุผล (บังคับ)**
- เฉพาะ Manager/Admin
- **AC:** บันทึกแล้ว On-hand เท่ากับยอดที่นับได้ และเกิด Movement ประเภท ADJUST พร้อมเหตุผล
- ถ้ายอดที่นับได้เท่ากับยอดในระบบ ให้ไม่สร้าง Movement และแสดงข้อความว่ายอดตรงกัน; การบันทึกเหตุการณ์ตรวจนับเป็น Roadmap

### 6.8 AI Insights (BR-05) — ดูหัวข้อ 9

### 6.9 Reports (BR-08) — แบบเบา
- Export CSV: Inventory ปัจจุบัน, Stock Movements (ตาม filter)

### 6.10 Users & Roles (BR-07) — แบบเบา
- ตารางผู้ใช้จำลอง + Role + สิทธิ์เมนู (อ่านอย่างเดียว) เพื่อแสดงแนวคิด

### 6.11 Settings — แบบเบา
- ตั้งค่า Reorder point เริ่มต้นสำหรับสินค้าใหม่ในอนาคตเท่านั้น, ธีม, ข้อมูลระบบ, ปุ่ม **Reset demo data**
- Reorder point ของสินค้าเดิมเป็นค่าประจำสินค้า; Manager/Admin แก้ได้ใน Product Detail
- **Reset demo data** คืนเฉพาะข้อมูลธุรกิจ (products, orders, movements) เป็น seed โดยไม่ล้าง session หรือ theme

### 6.12 Layout (ตามโครงที่โจทย์กำหนด)
- **Topbar:** ช่อง Search, กระดิ่งแจ้งเตือน (badge นับจำนวน Low/Critical alerts, คลิกแล้วเห็นรายการ), โปรไฟล์ (ชื่อ + Role) พร้อม dropdown
- **Sidebar:** โลโก้ + ชื่อระบบ, เมนูตามหมวด, Light/Dark toggle, Log Out
- ห้ามคัดลอกโลโก้นกจากตัวอย่างในโจทย์ ให้ออกแบบโลโก้เอง

---

## 7. Data Model (จำลองใน store กลาง)

- **Product:** sku, name, category, unit, locationId, onHand, reorderPoint, leadTimeDays
- **Location:** id (`A-02-03-1`), zone, aisle, rack, level, capacity, พิกัด/ระยะจาก dispatch point สำหรับคำนวณคำแนะนำตำแหน่งและลำดับเดิน
- **Order:** id, customer, createdAt, dueAt, priority, status, lines[{sku, qty, pickedQty}]
- **Movement:** id, timestamp, type (RECEIVE | PICK | ADJUST), sku, qty (+/-), qtyBefore, qtyAfter, locationId, userId, reference, reason
- **User:** id, name, role

**ข้อมูลตัวอย่าง (seed):** ~40 SKU ใน 5–6 หมวด, 4 Zone, ~12 Orders หลายสถานะ, Movement ย้อนหลัง ~30 วัน (จำเป็นสำหรับการคำนวณ Stockout Prediction), ต้องมีสินค้าที่ Low / Critical / Out อย่างน้อยอย่างละ 2–3 รายการเพื่อให้ Dashboard และ AI มีเรื่องให้แสดง

---

## 8. Business Rules

1. **การเปลี่ยนแปลง on-hand ทำได้ผ่าน action กลางเท่านั้น:** `receiveStock`, `pickItem`, `adjustStock` และทุก action ต้องสร้าง Movement เสมอ
2. on-hand ห้ามติดลบ
3. สถานะสต็อก: **Out** = 0, **Critical** = ≤ 50% ของ reorder point, **Low** = ≤ reorder point, **Normal** = มากกว่า reorder point
4. สีสถานะ: Out/Critical = แดง, Low = เหลือง/ส้ม, Normal = เขียว (ต้องมีข้อความกำกับด้วย ไม่ใช้สีอย่างเดียว)
5. Order: Pending → In Progress → Completed (หยิบไม่ครบ = Completed with shortage พร้อมเหตุผล)
6. Stock Adjustment ต้องมีเหตุผลทุกครั้ง
7. ทุกหน้าอ่านข้อมูลจาก store กลางเดียวกัน

---

## 9. AI Concepts (BR-05)

หน้า AI Insights เป็นหน้าเดียว รวม 4 แนวคิดตามโจทย์ ทุกการ์ดต้องบอก: **แก้ปัญหาอะไร / ใช้ข้อมูลอะไร / ผู้ใช้เอาผลไปทำอะไรต่อ** และมีป้าย "Simulated data — concept only"

| # | AI Concept | ระดับรายละเอียดใน Prototype |
|---|---|---|
| 1 | **Stockout Prediction** — สินค้าที่เสี่ยงหมดก่อนของใหม่มา | **ทำละเอียด** |
| 2 | **AI Manager Summary** — สรุปเรื่องที่ควรจัดการก่อน | **ทำละเอียด** |
| 3 | **Storage Location Recommendation** — แนะนำตำแหน่งวางสินค้า | แนวคิดสั้น + เชื่อมกับฟอร์ม Receiving |
| 4 | **Picking Route Optimization** — ลำดับหยิบที่เดินน้อยลง | แนวคิดสั้น + ตัวอย่างลำดับก่อน/หลัง |

**1) Stockout Prediction**
- ข้อมูลที่ใช้: Movement ประเภท PICK ย้อนหลัง 30 วัน, on-hand ปัจจุบัน, lead time
- กฎ (ไม่ใช่ ML): อัตราใช้เฉลี่ยต่อวัน = ยอดหยิบ 30 วัน ÷ 30, วันที่ของพอใช้ = on-hand ÷ อัตราใช้, **เสี่ยง** เมื่อวันที่ของพอใช้ < lead time
  - แสดง: SKU, on-hand, อัตราใช้/วัน, ของพอใช้กี่วัน, lead time, ระดับความเสี่ยง, **เหตุผลเป็นประโยค**, จำนวนที่แนะนำให้เติม
  - สูตรจำนวนแนะนำให้เติม = `max(0, reorderPoint + averageDailyUse × leadTimeDays − onHand)` แล้วปัดขึ้นเป็นจำนวนเต็ม; เหตุผลต้องแสดงสูตรและค่าตัวเลขที่ใช้
- ผู้ใช้ทำต่อ: ตรวจสอบและสั่งเติมสินค้า (คนตัดสินใจเอง)

**2) Manager Summary**
- ข้อมูลที่ใช้: สถานะ Order, งาน Picking, สินค้าใกล้หมด, รายการผิดปกติ (เช่น Adjustment ที่ยอดต่าง, หยิบไม่ครบ)
- แสดง: รายการปัญหาเรียงตามความเร่งด่วน แต่ละข้อมี เหตุผล + สิ่งที่ควรทำต่อ (สร้างจากข้อมูลใน store จริง)

**3) Storage Location Recommendation** — สินค้าหมุนเร็วควรอยู่ใกล้จุดแพ็ก/ส่ง, สินค้าหมวดเดียวกันอยู่ใกล้กัน, ตรวจความจุตำแหน่ง ใช้ข้อมูล: ความถี่การหยิบ, หมวด, ความจุ

**4) Picking Route Optimization** — จัดลำดับ pick list ตามพิกัดตำแหน่งแบบเดินต่อเนื่อง ลดการเดินกลับไปกลับมา ใช้ข้อมูล: ตำแหน่งสินค้าในออเดอร์

**ข้อจำกัด (ต้องพูดในสไลด์):** ผลลัพธ์เป็นแนวคิดและคำนวณจากข้อมูลจำลอง ยังไม่ได้ทดสอบความแม่นยำกับข้อมูลจริง ผู้จัดการต้องตรวจสอบคำแนะนำก่อนดำเนินการ

---

## 10. KPI (ตัวชี้วัดหลังใช้งานจริง ไม่ใช่ผลลัพธ์ที่ทำได้แล้ว)

| KPI | วัดอะไร |
|---|---|
| Inventory Accuracy | ยอดในระบบตรงกับยอดนับจริงกี่ % |
| Picking Error Rate | สัดส่วนบรรทัดที่หยิบผิด/ต่อบรรทัดทั้งหมด |
| Order Fulfillment Time | เวลาจาก Order เข้า ถึง Picking เสร็จ |
| Stockout Rate | สัดส่วนครั้งที่สินค้าหมดตอนมี Order เข้า |
| Time-to-find-stock | เวลาที่ใช้หาข้อมูลสต็อกหนึ่ง SKU |

**ห้ามแต่งตัวเลขผลลัพธ์** (เช่น "ลดความผิดพลาด 40%") ให้บอกว่าเป็น KPI ที่จะติดตามและต้องมี baseline ก่อน

---

## 11. Critical Test Flows (ต้องผ่านก่อน deploy ทุกครั้ง)

1. **Receiving:** รับ SKU X เข้า +20 → Inventory เพิ่ม 20 → Movement RECEIVE ปรากฏ → Dashboard ตัวเลขที่เกี่ยวข้องเปลี่ยน
2. **Picking:** เปิด Order ที่มี SKU X → Start → ยืนยันหยิบ 5 → Inventory ลด 5 → Movement PICK อ้าง Order → ครบทุกบรรทัดแล้ว Order = Completed
3. **Validation:** ใส่ SKU ผิดตอนยืนยัน → ระบบบล็อกพร้อมข้อความ ไม่ตัดสต็อก
4. **Negative guard:** หยิบมากกว่า on-hand → ถูกบล็อก
5. **Adjustment:** นับได้ 47 ระบบ 50 → ใส่เหตุผล → On-hand = 47 → Movement ADJUST (-3) พร้อมเหตุผล
6. **Alert:** ทำให้สินค้าลงต่ำกว่า reorder point → กระดิ่งและ Dashboard แสดง alert
7. **Persistence:** รีเฟรชหน้า ข้อมูลยังอยู่ และ Reset demo data คืนค่าเริ่มต้นได้
8. **Role:** Login เป็น Picker เห็นเฉพาะเมนูของ Picker

การทดสอบกฎใน `domain/stock.ts` ใช้ Vitest เป็น dev dependency โดยครอบคลุม Test Flows 1–5 และกรณีป้องกัน on-hand ติดลบ

---

## 12. Out of Scope / Roadmap (พูดในสไลด์ ไม่สร้างจริง)

Barcode/QR scanner จริง, หลายคลัง, เชื่อม ERP/บัญชี, Supplier & Purchase Order, Backend + ฐานข้อมูลจริง, AI/ML model จริงที่เทรนด้วยข้อมูลจริง, FIFO/FEFO และ lot/serial tracking, Stock reservation

---

## 13. Design Direction

- โทนฟ้า–ขาว สะอาด (ตามตัวอย่างโครงสร้างในโจทย์) สีอื่นใช้สื่อสถานะเท่านั้น
- Sidebar + Topbar ตามข้อ 6.12, รองรับ Light/Dark
- Responsive: เดสก์ท็อปเป็นหลัก แต่หน้า Orders & Picking ต้องใช้บนมือถือได้ดี (ปุ่มใหญ่)
- Empty state / error state ต้องมีข้อความที่เป็นมิตร
- ฟอนต์อ่านง่าย รองรับภาษาไทย (เช่น Inter + Noto Sans Thai)

---

## 14. ลำดับการสร้าง (รอบ)

| รอบ | ขอบเขต | เกณฑ์ผ่าน |
|---|---|---|
| 0 | Plan อย่างเดียว ห้ามเขียนโค้ด | ผู้ใช้อนุมัติแผน |
| 1 | Foundation: seed data, store กลาง, Login+Role, Layout, Light/Dark, deploy | เปิดลิงก์จริงได้, Login ได้, เมนูตาม Role |
| 2 | Inventory + Product Detail | ค้นหา/กรองได้, สีสถานะถูก |
| 3 | Receiving → Orders & Picking → Stock Movements + Stock Adjustment | Test Flow 1–5 ผ่าน |
| 4 | Dashboard + AI Insights | ตัวเลข Dashboard เปลี่ยนตาม Flow รอบ 3 |
| 5 | Reports, Users & Roles, Settings, Mobile picking, Polish | ทดสอบมือถือ + เดสก์ท็อป |

การตั้งค่าเริ่มต้นของ Reorder point ใน Settings ใช้กับสินค้าใหม่ในอนาคตเท่านั้น; รายละเอียดประสบการณ์ Settings จะตัดสินใน Round 5. GitHub repository สร้าง/เชื่อมต่อและ Vercel เชื่อมต่อโดยผู้ใช้ตามขั้นตอนที่ผู้ช่วยสรุปให้.
