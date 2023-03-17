const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);

const session = require("express-session");
const { Server } = require("socket.io");
const io = new Server(server);


// Use session middleware
const sessionMiddleware = session({
  secret: "secret-key",
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: false,
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
});

// Serve static files from the public directory
app.get("/", (_req, res) => {
  res.sendFile(__dirname + "/index.html");
});

const items = {
  2: "Coleslaw",
  3: "Roasted chicken",
  4: "Chicken Pizza",
  5: "Chicken Burger",
  6: "salad",
};

const orderHistory = [];

io.use((socket, next) => {
  sessionMiddleware(socket.request, socket.request.res, next);
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Get the unique identifier for the user's device
  const deviceId = socket.handshake.headers["user-agent"];

  // Check if the user already has an existing session
  if (
    socket.request.session[deviceId] &&
    socket.request.session[deviceId].userName
  ) {
    // If the user already has a session, use the existing user name and current order
    socket.emit(
      "bot-message",
      `Welcome back, ${
        socket.request.session[deviceId].userName
      }! You have a current order of ${socket.request.session[
        deviceId
      ].currentOrder.join(", ")}`
    );
  } else {
    // If the user does not have a session, create a new session for the user's device
    socket.request.session[deviceId] = {
      userName: "",
      currentOrder: [],
      deviceId: deviceId, // store the deviceId in the session object
    };
  }

  // Ask for the user's name if not provided already
  if (!socket.request.session[deviceId].userName) {
    socket.emit("bot-message", "Hi! What's your name?");
  } else {
    socket.emit(
      "bot-message",
      `Welcome back, ${
        socket.request.session[deviceId].userName
      }! You have a current order of ${socket.request.session[
        deviceId
      ].currentOrder.join(", ")}`
    );
  }

  let userName = socket.request.session[deviceId].userName;

  // Listen for incoming bot messages
  socket.on("bot-message", (message) => {
    console.log("Bot message received:", message);
    socket.emit("bot-message", message);
  });

  // Listen for incoming user messages
  socket.on("user-message", (message) => {
    console.log("User message received:", message);

    if (!userName) {
      // Save the user's name and update the welcome message
      userName = message;
      socket.request.session[deviceId].userName = userName;
      socket.emit(
        "bot-message",
        `Welcome to the Lemma's ChatBot, ${userName}! select\n1. To place an order\n99. To checkout order\n98. To view order history\n97. To view current order\n0. To cancel order`
      );
    } else {
      switch (message) {
        case "1":
          // Generate the list of items on the menu
          const itemOptions = Object.keys(items)
            .map((item) => `${item}. ${items[item]}`)
            .join("\n");
          socket.emit(
            "bot-message",
            `The Items on our menu are:\n${itemOptions}\nSelect the item number to add to your order`
          );
          break;
        case "97":
          // Show the user's their current order
          if (socket.request.session[deviceId].currentOrder.length > 0) {
            const currentOrder =
              socket.request.session[deviceId].currentOrder.join(", ");
            socket.emit(
              "bot-message",
              `Your current order: ${currentOrder}\n1. Place an order\n99. Checkout order\n98. Order history\n97. Current order\n0. Cancel order`
            );
          } else {
            socket.emit(
              "bot-message",
              `You don't have any items in your current order yet. Type '1' to see the menu.`
            );
          }
          break;
        case "99":
          // Checkout the order
          if (socket.request.session[deviceId].currentOrder.length > 0) {
            const currentOrder =
              socket.request.session[deviceId].currentOrder.join(", ");
            orderHistory.push({
              user: userName,
              order: currentOrder,
              date: new Date(),
            });
            socket.emit(
              "bot-message",
              `Thanks for your order, ${userName}! Your order of ${currentOrder} will be ready shortly.\n1. Place an order\n98. Order history\n0. Cancel order`
            );
            socket.request.session[deviceId].currentOrder = [];
          } else {
            socket.emit(
              "bot-message",
              `You don't have any items in your current order yet. Type '1' to see the menu.`
            );
          }
          break;
        case "98":
          // Show the order history
          if (orderHistory.length > 0) {
            const history = orderHistory
              .map(
                (order) =>
                  `${order.user} ordered ${
                    order.order
                  } on ${order.date.toDateString()}`
              )
              .join("\n");
            socket.emit(
              "bot-message",
              `Here is your order history:\n${history}. select \n1. To place an order\n0. To cancel order`
            );
          } else {
            socket.emit(
              "bot-message",
              `You have no order history. Type '1' to see the menu.`
            );
          }
          break;
        case "0":
          // Cancel the order
          const currentOrder = socket.request.session[deviceId].currentOrder;
          if (currentOrder.length === 0 && orderHistory.length === 0) {
            socket.emit(
              "bot-message",
              `There is nothing to cancel. Type '1' to see the menu.`
            );
          } else {
            socket.request.session[deviceId].currentOrder = [];
            orderHistory.length = 0;
            socket.emit(
              "bot-message",
              `Your order has been cancelled. Select \n1. To place a new order\n98. To view order history`
            );
          }
          break;
        default:
          // Add the item to the current order
          const itemNumber = parseInt(message);
          if (!isNaN(itemNumber) && items[itemNumber]) {
            socket.request.session[deviceId].currentOrder.push(
              items[itemNumber]
            );
            socket.emit(
              "bot-message",
              `You have added ${items[itemNumber]} to your current order\n you can order something else from the menu\n Type '97' to see your current order\n '98' to see order history\n '99' to checkout\n '0' to cancel your order`
            );
          } else {
            socket.emit(
              "bot-message",
              `Invalid. Type '1' to see the menu.`
            );
          }
          break;
      }
    }
  });
  // Listen for disconnection event
  socket.on("disconnect", () => {
    delete socket.request.session[deviceId];

    console.log("User disconnected:", socket.id);
  });
});

server.listen(3000, () => {
  console.log(`listening on port: 4000`);
});