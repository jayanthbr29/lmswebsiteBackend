const razorpayInstance = require("../services/razorpayService");
const crypto = require("crypto");
const Payment = require("../models/paymentModel");
const Student = require("../models/studentModel");
const Package = require("../models/packagesModel");
const CustomPackage = require("../models/customPackageModels");
const nodemailer = require("nodemailer");
const axios = require("axios");
const Subject = require("../models/subjectModel");
const Notification = require('../models/notificationModel');
const User = require('../models/userModel');
const UserNotification = require('../models/userNotificationModel');
const { studentPaymentRecievedAdmin, studentPaymentRecievedStudent } = require("../mailTemplate/mailTemplates");
const { sendMailFunctionAdmin, sendMailFunctionTA } = require("../Mail/sendMail");
const { getInvoicePDF, createInvoice } = require("./invoiceController");
const { body } = require("express-validator");
const TypeOfBatch = require("../models/typeOfBatchModel");


// Create Razorpay Order
exports.createOrder = async (req, res) => {
  const { studentId, amount, description, subjectIds, subjectId } = req.body;

  // Validate input
  if (!studentId || !amount) {
    return res
      .status(400)
      .json({ error: "Missing required fields: studentId, amount" });
  }

  try {
    // Check if student exists
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    // Check if package exists
    // const package = await Package.findById(packageId);
    // if (!package) {
    //   return res.status(404).json({ error: 'Package not found' });
    // }

    // Create Razorpay order
    const orderOptions = {
      amount: (Math.ceil(amount)) * 100, // Amount in paise
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
      payment_capture: 1, // Auto-capture
      notes: {
        student_id: studentId,
        // package_id: packageId,
        description: description || "Payment for course package",
        subjectIds,
        subjectId
      },
    };

    const order = await razorpayInstance.orders.create(orderOptions);
    // console.log("order", order.notes);

    // Save order details in Payment model
    const payment = new Payment({
      amount: (Math.ceil(amount)),
      currency: order.currency,
      status: "created",
      order_id: order.id,
      student_id: studentId,
      // package_id: packageId,
      description: description || "Payment for course package",
      receipt: order.receipt,
      razorpay_signature: order.razorpay_signature,
    });

    await payment.save();

    res.status(200).json(order);
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ error: "Unable to create order" });
  }
};

// exports.verifyPayment = async (req, res) => {
//   const signature = req.headers['x-razorpay-signature']; // Signature sent by Razorpay
//   const secrete = 'FPs-kRnkuFXq8tG-course-Payment'
//   const generated_signature = crypto.createHmac('sha256', secrete);
//   generated_signature.update(JSON.stringify(req.body));
//   const digested_signature = generated_signature.digest('hex');

//   if (digested_signature === signature) {
//     if (req.body.event == "payment.captured") {
//       console.log("Valid signature inside payment.captured", req.body);
//       // Payment is valid
//       const payment = await Payment.findOne({ order_id: req.body.payload.payment.entity.order_id });
//       if (!payment) {
//         return res.status(400).json({ error: 'Payment not found' });
//       }
//       // Update payment details
//       payment.payment_id = req.body.payload.payment.entity.id;
//       payment.status = 'paid';
//       await payment.save();
//       // Update student details
//       await Student.findByIdAndUpdate(payment.student_id, {
//         $push: {
//           // subscribed_Package: { _id: payment.package_id, is_active: true },
//           payment_id: payment._id
//         },
//         is_paid: true,
//       });

//       // Fetch the package to get duration
//       // const pkg = await Package.findById(payment.package_id);

//       // if (!pkg) {
//       //   return res.status(400).json({ error: "Associated package not found" });
//       // }

//       // Calculate package_expiry: payment date + duration months
//       // const paymentDate = new Date(); // Assuming payment is processed now
//       // const packageExpiryDate = new Date(
//       //   paymentDate.setMonth(paymentDate.getMonth() + pkg.duration)
//       // );

//       // Update student details
//       // await Student.findByIdAndUpdate(payment.student_id, {
//       //   package_expiry: packageExpiryDate,
//       // });

//     } else if (req.body.event == "payment_link.paid") {
//       console.log("Valid signature inside payment.link.paid", req.body);
//       console.log("request", req.body.payload.order.entity);
//       // Payment is valid
//       const payment = await Payment.findOne({ receipt: req.body.payload.order.entity.receipt });
//       console.log("payment", payment);
//       if (!payment) {
//         return res.status(400).json({ error: 'Payment not found' });
//       }
//       // Update payment details
//       payment.payment_id = req.body.payload.payment.entity.id;
//       payment.status = 'paid';
//       await payment.save();
//       // Update student details
//       await Student.findByIdAndUpdate(payment.student_id, {
//         $push: {
//           custom_package_id: { _id: payment.custom_package_id, is_active: true },
//           payment_id: payment._id
//         },
//         custom_package_status: "approved",
//       });
//       // Fetch the package to get duration
//       const pkg = await CustomPackage.findById(payment.custom_package_id);

//       if (!pkg) {
//         return res.status(400).json({ error: "Associated custom package not found" });
//       }

//       // Calculate package_expiry: payment date + duration months
//       const paymentDate = new Date(); // Assuming payment is processed now
//       const packageExpiryDate = new Date(
//         paymentDate.setMonth(paymentDate.getMonth() + pkg.duration)
//       );

//       // Update student details
//       await Student.findByIdAndUpdate(payment.student_id, {
//         custom_package_expiry: packageExpiryDate,
//       });
//       // update custom package details
//       await CustomPackage.findByIdAndUpdate(payment.custom_package_id, {
//         is_active: true, is_approved: true, is_price_finalized: true, admin_contacted: true, package_price: payment.amount,
//       });
//     }

//   } else {
//     console.log("Invalid signature");
//   }

//   res.json({ status: "ok" });
// }

exports.verifyPayment = async (req, res) => {
  const signature = req.headers["x-razorpay-signature"];
  const secrete = "FPs-kRnkuFXq8tG-course-Payment";
  const generated_signature = crypto.createHmac("sha256", secrete);
  generated_signature.update(JSON.stringify(req.body));
  const digested_signature = generated_signature.digest("hex");
  console.log("body", req.body);

  if (digested_signature === signature) {
  if (req.body.event == "payment.captured") {
    console.log("Valid signature inside payment.captured", req.body);
    console.log("request", req.body.payload.payment);

    // Payment is valaid
    const payment = await Payment.findOne({
      order_id: req.body.payload.payment.entity.order_id,
    });
    if (!payment) {
      return res.status(400).json({ error: "Payment not found" });
    }

    // Update payment details
    payment.payment_id = req.body.payload.payment.entity.id;
    payment.status = "paid";
    await payment.save();
    if (
      req.body.payload.payment.entity.notes?.batchId &&
      req.body.payload.payment.entity.notes?.subjectId &&
      req.body.payload.payment.entity.notes?.duration
    ) {
      const { batchId, subjectId, duration } =
        req.body.payload.payment.entity.notes || {};
      const durationInt = parseInt(
        req.body.payload.payment.entity.notes.duration,
        10
      );
      if (isNaN(durationInt) || durationInt <= 0) {
        console.error("Invalid duration provided:", duration);
        return res.status(400).json({ error: "Invalid duration provided" });
      }
      // Find the student document
      const student = await Student.findById(payment.student_id);
      if (!student) {
        console.error("Student not found with ID:", payment.student_id);
        return res.status(404).json({ error: "Student not found" });
      }
      // Find the matching subject subdocument
      const subjectSubdoc = student.subject_id.find(
        (sub) =>
          sub._id.toString() === subjectId.toString() &&
          sub.batch_id &&
          sub.batch_id.toString() === batchId.toString()
      );
      if (!subjectSubdoc) {
        console.error(
          `Subject subdocument not found for subjectId: ${subjectId} and batchId: ${batchId} in student: ${student._id}`
        );
        return res.status(404).json({
          error:
            "Subject and Batch combination not found in student's subject array",
        });
      }
      // Update the subdocument fields
      subjectSubdoc.duration = durationInt;

      // Calculate new batch_expiry_date: current date + duration months
      const currentDate = new Date();
      const newExpiryDate = new Date(currentDate);
      newExpiryDate.setMonth(newExpiryDate.getMonth() + durationInt);

      subjectSubdoc.batch_expiry_date = newExpiryDate;
      subjectSubdoc.batch_status = "active";

      // Optionally, set batch_assigned to true if required
      subjectSubdoc.batch_assigned = true;

      // Save the updated student document
      await student.save();
      console.log(`Updated subject_id subdoc for student ${student._id}:`, {
        subjectId,
        batchId,
        duration: durationInt,
        batch_expiry_date: newExpiryDate,
        batch_status: "active",
      });
      let items = [];
      const subject = await Subject.findById(subjectId);
      const batchType = await TypeOfBatch.findById(subjectSubdoc.type_of_batch);
      const itemData =
      {
        description: subject.subject_name,
        price: (batchType.price) * duration,
        quantity: 1
      }
      items.push(itemData)
      const studentOne = await Student.findById(payment.student_id)
      .populate("user_id")
      .populate("class")
      .populate("board_id")
      .populate("type_of_batch");
      console.log("studentOne", studentOne);
      let billTo = {
        name: studentOne.user_id.name,
        email: studentOne.user_id.email,
        phone: studentOne.phone_number,
      }
      let invoiceDate = new Date();
      let invoiceNumber = payment.payment_id;
      let discount = req.body.payload.payment.entity.notes?.discount || 0;
      const invoiceData = await createInvoice({
        body: {
          invoiceNumber,
          invoiceDate,
          billTo,
          items,
          discount
        }
      })
      const paymentOne = await Payment.findOne({
        order_id: req.body.payload.payment.entity.order_id,
      });
      paymentOne.invoice_id = invoiceData._id;
      paymentOne.save();
      const searchId = invoiceData._id;
      // Update student: set is_paid, push payment_id, etc.
      await Student.findByIdAndUpdate(payment.student_id, {
        $push: { payment_id: { _id: payment._id, invoice_id: invoiceData._id } },
        is_paid: true,
      });
      const pdfData = await getInvoicePDF({ body: { id: searchId, mode: "function" } });
      const subjets = [subject.subject_name];
      const typeofBatchs = [batchType.mode];

      const html = studentPaymentRecievedStudent(studentOne.user_id.name, studentOne.user_id.email, payment.amount, payment.payment_id, studentOne.board_id.name, studentOne.class.classLevel, subjets, typeofBatchs);
      await sendMailFunctionTA(studentOne.user_id.email, 'Subscription Done', html,pdfData);

      const users = await User.find({ role: "admin" });
      users.map(async (user) => {

        const notification = new Notification({
          user_id: user._id,
          message: 'Student Payment Recieved',
          title: "Amount Recieved",
          is_all: false,
        });
        const savedNotification = await notification.save();
        const userNotifications = new UserNotification({
          user_id: user._id,
          notification_id: savedNotification._id
        })
        userNotifications.save();
        const html = studentPaymentRecievedAdmin(studentOne.user_id.name, studentOne.user_id.email, payment.amount, payment.payment_id, studentOne.board_id.name, studentOne.class.classLevel, subjets, typeofBatchs);
        await sendMailFunctionAdmin(user.email, 'Subscription Done', html, pdfData);
      })




    } else {
      const studentOne = await Student.findById(payment.student_id)
        .populate({
          path: 'subject_id._id',      // The field you want to populate
          model: 'Subject',            // The model name for the reference
          select: 'subject_name',      // (optional) which fields to select from Subject
        })
        .populate({
          path: 'subject_id.type_of_batch',
          model: 'TypeOfBatch',
          select: 'mode price',        // (optional)
        })
        .populate("user_id")
        .populate("class")
        .populate("board_id")
        .populate("type_of_batch");
      let items = [];
      // studentOne.map((student) => {
      studentOne.subject_id.map((data) => {
        const itemData =
        {
          description: data._id.subject_name,
          price: (data.type_of_batch.price) * data.duration,
          quantity: 1
        }
        items.push(itemData)
      })

      // })
      let billTo = {
        name: studentOne.user_id.name,
        email: studentOne.user_id.email,
        phone: studentOne.phone_number,
      }
      let invoiceDate = new Date();
      let invoiceNumber = payment.payment_id;
      let discount = studentOne?.discountAmount || 0;
      const invoiceData = await createInvoice({
        body: {
          invoiceNumber,
          invoiceDate,
          billTo,
          items,
          discount
        }
      })
      console.log("invoiceData", invoiceData._id);
      const paymentOne = await Payment.findOne({
        order_id: req.body.payload.payment.entity.order_id,
      });
      paymentOne.invoice_id = invoiceData._id;
      paymentOne.save();
      // Update student: set is_paid, push payment_id, etc.
      await Student.findByIdAndUpdate(payment.student_id, {
        $push: { payment_id: { _id: payment._id, invoice_id: invoiceData._id } },
        is_paid: true,
      });
      const subjets = studentOne.subject_id.map((data) => {
        return data._id.subject_name
      })
      const typeofBatchs = studentOne.subject_id.map((data) => {
        return data.type_of_batch.mode
      })
      // payment.invoice_id = invoiceData._id;
      // payment.save();
      const searchId = invoiceData._id;
      const pdfData = await getInvoicePDF({ body: { id: searchId, mode: "function" } });

      const html = studentPaymentRecievedStudent(studentOne.user_id.name, studentOne.user_id.email, payment.amount, payment.payment_id, studentOne.board_id.name, studentOne.class.classLevel, subjets, typeofBatchs);
      await sendMailFunctionTA(studentOne.user_id.email, 'Subscription Done', html,pdfData);

      const users = await User.find({ role: "admin" });
      users.map(async (user) => {

        const notification = new Notification({
          user_id: user._id,
          message: 'Student Payment Recieved',
          title: "Amount Recieved",
          is_all: false,
        });
        const savedNotification = await notification.save();
        const userNotifications = new UserNotification({
          user_id: user._id,
          notification_id: savedNotification._id
        })
        userNotifications.save();
        const html = studentPaymentRecievedAdmin(studentOne.user_id.name, studentOne.user_id.email, payment.amount, payment.payment_id, studentOne.board_id.name, studentOne.class.classLevel, subjets, typeofBatchs);
        await sendMailFunctionAdmin(user.email, 'Subscription Done', html, pdfData);
      })




    }

  } else if (req.body.event == "payment_link.paid") {
    console.log("Valid signature inside payment.link.paid", req.body);
    console.log("request", req.body.payload.order.entity);

    // Payment is valid
    const payment = await Payment.findOne({
      receipt: req.body.payload.order.entity.receipt,
    });
    console.log("payment", payment);

    // if (!payment) {
    //   return res.status(400).json({ error: "Payment not found" });
    // }

    // Update payment details
    payment.payment_id = req.body.payload.payment.entity.id;
    payment.status = "paid";
    await payment.save();
    const studentOne = await Student.findById(payment.student_id)
      .populate({
        path: 'subject_id._id',      // The field you want to populate
        model: 'Subject',            // The model name for the reference
        select: 'subject_name',      // (optional) which fields to select from Subject
      })
      .populate({
        path: 'subject_id.type_of_batch',
        model: 'TypeOfBatch',
        select: 'mode price',        // (optional)
      })
      .populate("user_id")
      .populate("class")
      .populate("board_id")
      .populate("type_of_batch");
    let items = [];
    // studentOne.map((student) => {
    studentOne.subject_id.map((data) => {
      const itemData =
      {
        description: data._id.subject_name,
        price: (data.type_of_batch.price) * data.duration,
        quantity: 1
      }
      items.push(itemData)
    })

    // })
    let billTo = {
      name: studentOne.user_id.name,
      email: studentOne.user_id.email,
      phone: studentOne.phone_number,
    }
    let invoiceDate = new Date();
    let invoiceNumber = payment.payment_id;
    let discount = studentOne?.discountAmount || 0;
    const invoiceData = await createInvoice({
      body: {
        invoiceNumber,
        invoiceDate,
        billTo,
        items,
        discount
      }
    })
    console.log("invoiceData", invoiceData._id);
    const paymentOne = await Payment.findOne({
      order_id: req.body.payload.payment.entity.order_id,
    });
    paymentOne.invoice_id = invoiceData._id;
    paymentOne.save();
    // Update student: set is_paid, push payment_id, etc.
    await Student.findByIdAndUpdate(payment.student_id, {
      $push: { payment_id: { _id: payment._id, invoice_id: invoiceData._id } },
      is_paid: true,
      paymentLink_status: "approved",
    });

    const subjets = studentOne.subject_id.map((data) => {
      return data._id.subject_name
    })
    const typeofBatchs = studentOne.subject_id.map((data) => {
      return data.type_of_batch.mode
    })
    // payment.invoice_id = invoiceData._id;
    // payment.save();
    const searchId = invoiceData._id;
    const pdfData = await getInvoicePDF({ body: { id: searchId, mode: "function" } });

    const html = studentPaymentRecievedStudent(studentOne.user_id.name, studentOne.user_id.email, payment.amount, payment.payment_id, studentOne.board_id.name, studentOne.class.classLevel, subjets, typeofBatchs);
    await sendMailFunctionTA(studentOne.user_id.email, 'Subscription Done', html,pdfData);

    const users = await User.find({ role: "admin" });
    users.map(async (user) => {

      const notification = new Notification({
        user_id: user._id,
        message: 'Student Payment Recieved',
        title: "Amount Recieved",
        is_all: false,
      });
      const savedNotification = await notification.save();
      const userNotifications = new UserNotification({
        user_id: user._id,
        notification_id: savedNotification._id
      })
      userNotifications.save();
      const html = studentPaymentRecievedAdmin(studentOne.user_id.name, studentOne.user_id.email, payment.amount, payment.payment_id, studentOne.board_id.name, studentOne.class.classLevel, subjets, typeofBatchs);
      await sendMailFunctionAdmin(user.email, 'Subscription Done', html, pdfData);
    })




    // Update student details
    // await Student.findByIdAndUpdate(payment.student_id, {
    //   $push: {
    //     payment_id: payment._id,
    //   },
    //   is_paid: true,

    // });
    // -------------- END OF NEW CODE -----------------------------------------------

    console.log("Payment link paid, custom package updated successfully");
  }
  } else {
    console.log("Invalid signature");
  }

  res.json({ status: "ok" });
};

exports.createCustomPackageOrder = async (req, res) => {
  const { amount, student_id } = req.body;
  try {
    // Create Razorpay order
    // Validate input
    if (!student_id || !amount) {
      return res.status(400).json({
        error: "Missing required fields: studentId, packageId, amount",
      });
    }
    // Check if student exists
    const student = await Student.findById(student_id).populate("user_id");
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }


    const orderOptions = {
      amount: (Math.ceil(amount)) * 100, // Amount in paise
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
      payment_capture: 1, // Auto-capture
      notes: {
        student_id: student_id,
        description: "Payment for course package",
      },
    };
    const order = await razorpayInstance.orders.create(orderOptions);
    // Save order details in Payment model
    const payment = new Payment({
      amount: (Math.ceil(amount)),
      currency: order.currency,
      status: "created",
      order_id: order.id,
      student_id: student_id,
      description: "Payment for course package",
      receipt: order.receipt,
    });
    // // callback_url: 'https://example-callback-url.com/',
    await payment.save();
    const paymentLinkResponse = await axios.post(
      "https://api.razorpay.com/v1/payment_links",
      {
        amount: (Math.ceil(amount)) * 100, // Amount in paise (1 INR = 100 paise)
        currency: "INR",
        accept_partial: true,
        first_min_partial_amount: 100, // Optional, for partial payments
        expire_by: Math.floor(Date.now() / 1000) + 3600, // Set expiry to 1 hour from now
        reference_id: order.receipt, // Reference ID for tracking
        description: `Payment for Custom Package `,
        customer: {
          name: student.user_id.name, // You can replace this with dynamic name if needed
          contact: student.phone_number, // You can replace with dynamic contact if needed
          email: student.user_id.email, // Student's email
        },
        notify: {
          sms: true,
          email: true,
        },
        reminder_enable: true,
        notes: {
          policy_name: "Topper Academy Payament", // Add your custom notes here
        },
        callback_url:
          "https://www.thetopperacademy.com/", // Callback URL
        callback_method: "get", // HTTP method for the callback
      },
      {
        auth: {
          username: razorpayInstance.key_id, // Razorpay Key ID
          password: razorpayInstance.key_secret, // Razorpay Key Secret
        },
      }
    );
    const paymentLink = paymentLinkResponse.data.short_url;
    // Respond with success
    res.json({
      success: true,
      message: "Payment link sent to the student email.",
      paymentLink: paymentLink,
    });
  } catch (error) {
    console.error(
      "Error creating Razorpay payment link or sending email:",
      error
    );
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAllPayments = async (req, res) => {
  try {
    const payments = await Payment.find()
      .populate({
        path: "student_id",
        populate: [
          { path: "user_id", select: "name email" },
          { path: "class", select: "className classLevel" },
          { path: "subject_id._id", select: "subject_name" },
          { path: "board_id", select: "name" },
          { path: "type_of_batch", select: "mode" },
        ],
      })
      .populate("package_id");
    res.status(200).json(payments);
  } catch (error) {
    console.error("Error fetching payments:", error);
    res.status(500).json({ error: "Server error" });
  }
};

exports.createOrderRenewal = async (req, res) => {
  const { studentId, amount, description, batchId, subjectId, duration } =
    req.body;

  // Validate input
  if (!studentId || !amount) {
    return res
      .status(400)
      .json({ error: "Missing required fields: studentId, amount" });
  }

  try {
    // Check if student exists
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    // Check if package exists
    // const package = await Package.findById(packageId);
    // if (!package) {
    //   return res.status(404).json({ error: 'Package not found' });
    // }

    // Create Razorpay order
    const orderOptions = {
      amount: amount * 100, // Amount in paise
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
      payment_capture: 1, // Auto-capture
      notes: {
        student_id: studentId,
        // package_id: packageId,
        description: description || "Payment for course package",
        batchId,
        subjectId,
        duration,
      },
    };

    const order = await razorpayInstance.orders.create(orderOptions);

    // Save order details in Payment model
    const payment = new Payment({
      amount: amount,
      currency: order.currency,
      status: "created",
      order_id: order.id,
      student_id: studentId,
      // package_id: packageId,
      description: description || "Payment for course package",
      receipt: order.receipt,
      razorpay_signature: order.razorpay_signature,
    });

    await payment.save();
    console.log("rrr", order)

    res.status(200).json(order);
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ error: "Unable to create order" });
  }
};

/**
 * Controller to get all payments for a specific student.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getPaymentsByStudentId = async (req, res) => {
  try {
    // Extract student ID from URL params
    const { studentId } = req.params;

    // Fetch payments belonging to the specified student
    const payments = await Payment.find({ student_id: studentId })
      .populate("student_id", "student_id user_id") // fields you want from Student
      .populate("package_id", "name price") // fields you want from Package
      .populate("custom_package_id", "subject_id duration") // fields from CustomPackage
      .exec();

    // If no payments found, return a 404 or empty array
    if (!payments || payments.length === 0) {
      return res.status(404).json({
        error: "No payments found for this student",
      });
    }

    // Return the payments data
    return res.status(200).json({
      message: "Payments fetched successfully",
      payments,
    });
  } catch (error) {
    console.error("Error fetching payments by student ID:", error);
    return res.status(500).json({
      error: "An error occurred while fetching payments",
    });
  }
};
