# SmartStock WMS — Round 3 QA Checklist

ใช้ credential ใดก็ได้ใน Demo Access แล้วเลือก Role ตามแต่ละขั้น รีเซ็ต demo data ก่อนเริ่มเพื่อให้จำนวนในตารางตรงกับ seed ปัจจุบัน

| Flow | ขั้น | Role | สิ่งที่ให้ทดสอบ | ผลที่ควรเห็น | ผล |
|---|---:|---|---|---|---|
| 1 Receiving | 1 | Receiver | เปิด Receiving เลือก SKU ที่ capacity เหลืออย่างน้อย 20 แล้วรับเข้า 20 | On-hand เพิ่ม 20 และมี Movement `RECEIVE +20` | ☐ ผ่าน / ☐ ไม่ผ่าน |
| 1 Receiving | 2 | Receiver | เปิด SKU เดิมใน Inventory และ Recent receipts | Inventory แสดงยอดใหม่ และมี receipt ล่าสุดตรงกับ SKU/จำนวน | ☐ ผ่าน / ☐ ไม่ผ่าน |
| 1 Dashboard | 3 | Manager | เปิด Dashboard หลังรับสินค้า | **รอ Round 4a (Dashboard)** — ไม่ต้องให้ผ่านใน Round 3 ขั้น 3e | รอ Round 4a |
| 2 Picking | 1 | Picker | เปิด order ที่ยังทำงาน กด Start Picking แล้วหยิบตามจำนวนที่เหลือของแต่ละบรรทัด (ใช้ 5 หน่วยเมื่อมีบรรทัดที่เหลืออย่างน้อย 5) | On-hand ลดตามจำนวน และมี Movement `PICK` อ้าง Order; เมื่อครบทุกบรรทัด Order เป็น Completed | ☐ ผ่าน / ☐ ไม่ผ่าน |
| 3 Validation | 1 | Picker | เปิด order ที่กำลังทำงาน ใส่/สแกน SKU ผิด แล้วยืนยัน | ระบบแจ้ง error; On-hand, Order และ Movement ไม่เปลี่ยน | ☐ ผ่าน / ☐ ไม่ผ่าน |
| 4 Negative guard | 1 | Picker | ลองยืนยันจำนวนที่มากกว่า On-hand | ระบบบล็อก; On-hand และ Movement ไม่เปลี่ยน | ☐ ผ่าน / ☐ ไม่ผ่าน |
| 5 Adjustment | 1 | Manager | เลือก SKU-025 (seed เริ่ม 50 each), นับได้ 47, เลือกเหตุผล แล้วเปิด/ยืนยัน dialog | On-hand เป็น 47; มี Movement `ADJUST -3` พร้อมเหตุผล | ☐ ผ่าน / ☐ ไม่ผ่าน |
| 6 Alert | 1 | Manager | เลือกสินค้าที่ปกติ แล้วปรับจำนวนให้ต่ำกว่า reorder point; เปิดกระดิ่ง | จำนวน alert เพิ่ม และ SKU ปรากฏในรายการแจ้งเตือน | ☐ ผ่าน / ☐ ไม่ผ่าน |
| 6 Alert | 2 | Manager | เปิด Inventory และกรอง/ดูสถานะสินค้าที่ปรับ | SKU เดิมแสดงยอดใหม่และสถานะ Low/Critical ตามยอดเทียบ reorder point | ☐ ผ่าน / ☐ ไม่ผ่าน |
| 6 Dashboard | 3 | Manager | เปิด Dashboard หลังเกิด alert | **รอ Round 4a (Dashboard)** — ไม่ต้องให้ผ่านใน Round 3 ขั้น 3e | รอ Round 4a |
| 7 Persistence & Reset | 1 | Manager | หลังทำ stock action รีเฟรชหน้า | On-hand และ Movement ยังคงอยู่ | ☐ ผ่าน / ☐ ไม่ผ่าน |
| 7 Persistence & Reset | 2 | Manager | เปิด dropdown โปรไฟล์ → Reset demo data → ยืนยัน | Products, Orders และ Movements กลับเป็น seed; session และ theme ยังคงเดิม | ☐ ผ่าน / ☐ ไม่ผ่าน |
| 7 Reset permission | 3 | Admin | เปิด dropdown โปรไฟล์และรีเซ็ตข้อมูลพร้อมยืนยัน | เมนู Reset demo data แสดง และ reset สำเร็จ | ☐ ผ่าน / ☐ ไม่ผ่าน |
| 7 Reset permission | 4 | Picker / Receiver | เปิด dropdown โปรไฟล์ | ไม่เห็นเมนู Reset demo data | ☐ ผ่าน / ☐ ไม่ผ่าน |
| 8 Role | 1 | Picker | Login เป็น Picker แล้วตรวจ Sidebar | เห็นเมนูของ Picker; Dashboard และเมนูผู้จัดการไม่แสดง | ☐ ผ่าน / ☐ ไม่ผ่าน |
| 8 Role | 2 | Receiver | Login เป็น Receiver แล้วตรวจ Sidebar | เห็น Receiving และ Inventory; Dashboard/Orders/Reset demo data ไม่แสดง | ☐ ผ่าน / ☐ ไม่ผ่าน |
| 8 Role | 3 | Manager / Admin | Login แล้วตรวจ dropdown โปรไฟล์ | เห็น Reset demo data; Manager ไม่มี Users & Roles ตาม role menu | ☐ ผ่าน / ☐ ไม่ผ่าน |

## หมายเหตุ

- Test Flows 1 และ 6 ตรวจ Dashboard แยกไว้เป็นรายการรอ Round 4a; ใน 3e ให้ตรวจ Receive/Inventory/Movement และกระดิ่ง/Inventory ตามรายการที่ทำได้แล้ว
- Seed ปัจจุบันอาจไม่มี order line ที่เหลือ 5 หน่วยพอดี; ในการทดสอบมือให้หยิบจำนวนที่เหลือจริงของบรรทัดและทำให้ครบทุกบรรทัด ส่วน integration test ระดับ store ทดสอบจำนวน 5 โดยเฉพาะ
- หลังทดสอบ Reset ให้ยืนยันว่า Profile ยังแสดง Role เดิมและธีมเดิม

## Round 4a — Dashboard

| ขั้น | Role | สิ่งที่ให้ทดสอบ | ผลที่ควรเห็น | ผล |
|---:|---|---|---|---|
| 1 | Manager / Admin | เปิด Dashboard และตรวจ KPI ทั้งสี่ใบ | ตัวเลขตรงกับ Inventory, Orders, Completed today และ PICK units ใน store; attention แยก Out/Critical/Low | ☐ ผ่าน / ☐ ไม่ผ่าน |
| 2 | Receiver | รับสินค้า SKU สถานะ Low จนเกิน reorder point แล้วเปิด Dashboard ใน Manager session | จำนวน Items needing attention ลดลง และตัวเลขเปลี่ยนจาก store | ☐ ผ่าน / ☐ ไม่ผ่าน |
| 3 | Picker | หยิบสินค้าจนต่ำกว่า reorder point แล้วเปิด Dashboard ใน Manager session | Items needing attention เพิ่ม; Picking completed today และจำนวน PICK units แสดงตามข้อมูลวันนี้ | ☐ ผ่าน / ☐ ไม่ผ่าน |
| 4 | Manager | ปรับสินค้าสถานะ Normal เป็น 0 แล้วเปิด Dashboard | สินค้าปรากฏใน Out และ Items needing attention เพิ่ม | ☐ ผ่าน / ☐ ไม่ผ่าน |
| 5 | Manager / Admin | คลิก KPI, chart status, สินค้าเร่งด่วน, Order เร่งด่วน และ Stock Movements | ลิงก์เปิดหน้าที่ถูกต้อง; Inventory หลายสถานะกรองได้; Order เปิดรายละเอียดตาม ID | ☐ ผ่าน / ☐ ไม่ผ่าน |
| 6 | Manager / Admin | ตรวจการ์ด Overdue or due soon | คำนิยามแสดงใต้หัวข้อ; Overdue มาก่อน แล้ว due เร็วไปช้า สูงสุด 5 รายการ | ☐ ผ่าน / ☐ ไม่ผ่าน |
| 7 | Manager / Admin | ตรวจ KPI วันนี้และกราฟ movement | คำนิยาม Asia/Bangkok แสดง; กราฟมี 14 วัน ป้ายวันที่และค่า RECEIVE/PICK | ☐ ผ่าน / ☐ ไม่ผ่าน |
| 8 | Picker / Receiver | เปิด `/` โดยตรง | ถูก redirect ไปหน้าแรกของ Role และไม่มี Dashboard ในเมนู | ☐ ผ่าน / ☐ ไม่ผ่าน |
| 9 | Manager / Admin | ตรวจหน้าจอกว้างและแคบ รวมถึง empty state | การ์ดและกราฟจัดวางอ่านได้; empty state แสดงเมื่อไม่มีข้อมูล | ☐ ผ่าน / ☐ ไม่ผ่าน |

## Round 4b — Stockout Prediction

| ขั้น | Role | สิ่งที่ให้ทดสอบ | ผลที่ควรเห็น | ผล |
|---:|---|---|---|---|
| 1 | Manager / Admin | เปิด `/ai-insights` และตรวจส่วนหัว | มีป้าย “Simulated data — concept only”, เวลา “As of ...” และเมนูลัด Stockout Prediction | ☐ ผ่าน / ☐ ไม่ผ่าน |
| 2 | Picker / Receiver | เปิด `/ai-insights` โดยตรง | ถูก redirect ไปหน้าแรกของ Role; ไม่มี AI Insights ในเมนู | ☐ ผ่าน / ☐ ไม่ผ่าน |
| 3 | Manager / Admin | ตรวจ SKU-007/008/009/016/023 และกด chip แต่ละระดับ | เห็น At risk 3, High 1, Watch 1; ตารางกรองตรงกับ chip และเรียงตามความเสี่ยง/วันของพอใช้ | ☐ ผ่าน / ☐ ไม่ผ่าน |
| 4 | Manager / Admin | ขยาย Show calculation ในแต่ละแถว | สูตรและตัวเลขตรงกับค่า PICK 30 วัน, on-hand, lead time และจำนวนแนะนำ; เหตุผล/ขั้นต่อไปตรงกับข้อมูล | ☐ ผ่าน / ☐ ไม่ผ่าน |
| 5 | Manager / Admin | เปิด View product จากแถว | ไปยัง `/inventory/:sku` ของ SKU นั้น | ☐ ผ่าน / ☐ ไม่ผ่าน |
| 6 | Manager / Admin | หยิบสินค้าใน Order แล้วกลับมา AI Insights | ค่า PICK เฉลี่ย/วันและ days of supply เปลี่ยนตาม store | ☐ ผ่าน / ☐ ไม่ผ่าน |
| 7 | Manager / Admin | ทดสอบ desktop, mobile ~375px, Light/Dark และ empty/filter state | ตารางเลื่อนได้บนจอระดับกลางหรือแสดงการ์ดบนมือถือ; ข้อความและ badges อ่านได้ทุกธีม | ☐ ผ่าน / ☐ ไม่ผ่าน |
| 8 | Manager / Admin | ใช้ Reset demo data หลังยืนยัน (ถ้าต้องการ seed ชุดใหม่) | โหลด risk examples ชุดใหม่; session/theme คงเดิม; เข้าใจว่าข้อมูลธุรกิจเดิมถูก reset | ☐ ผ่าน / ☐ ไม่ผ่าน |
