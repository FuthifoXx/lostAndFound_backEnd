import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'

const generateReceiptPDF = async (receipt) => {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
  })

  const verificationUrl = `${process.env.FRONTEND_URL}/verify/receipt/${receipt.receiptNumber}`

  const qrCode = await QRCode.toDataURL(verificationUrl)

  // --------------------------------------------------
  // HEADER
  // --------------------------------------------------

  doc
    .fontSize(24)
    .font('Helvetica-Bold')
    .text('LOST & FOUND', { align: 'center' })

  doc
    .fontSize(11)
    .font('Helvetica')
    .text('Management System', { align: 'center' })

  doc.moveDown()

  doc
    .fontSize(18)
    .font('Helvetica-Bold')
    .text('COLLECTION RECEIPT', { align: 'center' })

  doc.moveDown()

  doc
    .fontSize(11)
    .font('Helvetica-Bold')
    .text(`Receipt Number: ${receipt.receiptNumber}`, {
      align: 'center',
    })

  doc.moveDown()

  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke()

  doc.moveDown()

  // --------------------------------------------------
  // STATUS
  // --------------------------------------------------

  doc
    .fontSize(11)
    .font('Helvetica-Bold')
    .text('PROPERTY SUCCESSFULLY RELEASED', {
      align: 'center',
    })

  doc.moveDown(2)

  // --------------------------------------------------
  // OWNER DETAILS
  // --------------------------------------------------

  doc.fontSize(14).font('Helvetica-Bold').text('OWNER DETAILS')

  doc.moveDown(0.5)

  const ownerName = [
    ...(receipt.owner?.firstNames || []),
    receipt.owner?.surname,
  ]
    .filter(Boolean)
    .join(' ')

  doc
    .fontSize(10)
    .font('Helvetica')
    .text(`Full Name: ${ownerName || 'Not available'}`)

  doc.text(`Email: ${receipt.owner?.email || 'Not available'}`)

  let documentType = 'Identity Document'
  let documentNumber = 'Not provided'

  if (receipt.idNumber) {
    documentType = 'RSA ID Number'
    documentNumber = receipt.idNumber
  } else if (receipt.passportNumber) {
    documentType = 'Passport Number'
    documentNumber = receipt.passportNumber
  } else if (receipt.documentNumber) {
    documentType = 'Document Number'
    documentNumber = receipt.documentNumber
  }

  const maskedDocument =
    documentNumber.length > 4
      ? `${'*'.repeat(documentNumber.length - 4)}${documentNumber.slice(-4)}`
      : documentNumber

  doc.text(`${documentType}: ${maskedDocument}`)

  doc.moveDown()

  // --------------------------------------------------
  // PROPERTY DETAILS
  // --------------------------------------------------

  doc.fontSize(14).font('Helvetica-Bold').text('PROPERTY DETAILS')

  doc.moveDown(0.5)

  doc
    .fontSize(10)
    .font('Helvetica')
    .text(`Item: ${receipt.item?.name || 'Not available'}`)

  doc.text(`Description: ${receipt.item?.description || 'Not available'}`)

  doc.text(`Location: ${receipt.item?.location || 'Not available'}`)

  doc.moveDown()

  // --------------------------------------------------
  // PARTNER
  // --------------------------------------------------

  doc.fontSize(14).font('Helvetica-Bold').text('COLLECTION LOCATION')

  doc.moveDown(0.5)

  doc
    .fontSize(10)
    .font('Helvetica')
    .text(`Partner: ${receipt.partner?.name || 'Not available'}`)

  doc.text(`Branch: ${receipt.partner?.branch || 'Not available'}`)

  doc.moveDown()

  // --------------------------------------------------
  // COLLECTION DETAILS
  // --------------------------------------------------

  doc.fontSize(14).font('Helvetica-Bold').text('COLLECTION DETAILS')

  doc.moveDown(0.5)

  const collectedAt = new Date(receipt.collectedAt)

  doc
    .fontSize(10)
    .font('Helvetica')
    .text(`Collected By: ${receipt.collectedBy}`)

  doc.text(`Date: ${collectedAt.toLocaleDateString()}`)

  doc.text(`Time: ${collectedAt.toLocaleTimeString()}`)

  doc.moveDown()

  // --------------------------------------------------
  // NOTES
  // --------------------------------------------------

  if (receipt.notes) {
    doc.fontSize(14).font('Helvetica-Bold').text('COLLECTION NOTES')

    doc.moveDown(0.5)

    doc.fontSize(10).font('Helvetica').text(receipt.notes)

    doc.moveDown()
  }

  // --------------------------------------------------
  // SIGNATURE
  // --------------------------------------------------

  doc.fontSize(14).font('Helvetica-Bold').text('CONFIRMATION')

  doc.moveDown(0.5)

  doc
    .fontSize(10)
    .font('Helvetica')
    .text(
      'I confirm that the property described above has been released to me after verification of my identity.',
    )

  doc.moveDown(2)

  doc.moveTo(60, doc.y).lineTo(250, doc.y).stroke()

  doc.fontSize(9).text('Owner Signature', 60, doc.y + 5)

  if (receipt.signature) {
    doc
      .fontSize(12)
      .font('Helvetica-Oblique')
      .text(receipt.signature, 60, doc.y - 35)
  }

  doc
    .moveTo(320, doc.y - 10)
    .lineTo(510, doc.y - 10)
    .stroke()

  doc
    .fontSize(9)
    .font('Helvetica')
    .text('Partner Representative', 320, doc.y - 5)

  // --------------------------------------------------
  // QR CODE
  // --------------------------------------------------

  const qrBuffer = Buffer.from(qrCode.split(',')[1], 'base64')

  doc.image(qrBuffer, 420, 600, {
    width: 100,
  })

  doc.fontSize(8).text('Scan to verify this receipt', 405, 705, {
    width: 130,
    align: 'center',
  })

  // --------------------------------------------------
  // FOOTER
  // --------------------------------------------------

  doc
    .fontSize(8)
    .font('Helvetica')
    .text(
      'This receipt serves as official confirmation of the collection and release of the property.',
      50,
      750,
      {
        width: 495,
        align: 'center',
      },
    )

  doc.fontSize(8).text('Lost & Found Management System', 50, 770, {
    width: 495,
    align: 'center',
  })

  return {
    doc,
    verificationUrl,
  }
}

export default generateReceiptPDF
