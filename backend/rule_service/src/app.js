import * as dotenv from "dotenv"
dotenv.config()

import express from "express"
const app = express()
import cors from "cors"

import { createServer } from "http"
import { Server } from "socket.io"
import { instrument } from "@socket.io/admin-ui"

import jackrabbit from "@pager/jackrabbit"

// socket.io setup
// #####################################

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:3000", "https://admin.socket.io"],
  },
})

// admin ui
instrument(io, {
  auth: false,
})

// express middleware
// #####################################

app.use(cors())
app.use(express.json())

// amqp (rabbitmq) event handling
// #####################################

const rabbit = jackrabbit(process.env.AMQP_URL)
const exchange = rabbit.default()
const queue = exchange.queue({ name: "task_queue", durable: true })
const unpublishedMessages = []

// check if rabbitmq is connected
rabbit.on("connected", () => {
  console.log("[AMQP] RabbitMQ connection established")

  // consume messages from queue
  queue.consume((data, ack) => {
    console.log(
      "[AMQP] Message received from " + data.service + ": ",
      data.message
    )
    ack()
  })
})

rabbit.on("reconnected", () => {
  console.log("[AMQP] RabbitMQ connection re-established")

  // publish unpublished messages
  unpublishedMessages.forEach((message) => {
    console.log("[AMQP] Publishing offline message")
    publishMessage(message)
  })

  queue.consume((data, ack) => {
    console.log(
      "[AMQP] Message received from " + data.service + ": ",
      data.message
    )
    ack()
  })
})

const publishMessage = (message) => {
  // check  if rabbitmq is connected
  if (rabbit.isConnectionReady()) {
    console.log("[AMQP] Publishing message", message)
    exchange.publish(message, { key: "task_queue" })
  } else {
    console.log("[AMQP] RabbitMQ not connected, saving message for later")
    unpublishedMessages.push(message)
  }
}

// express routes
// #####################################

app.get("/", (req, res) => {
  publishMessage({
    service: "rule_service",
    message: "Hello from rule_service",
  })

  res.send("rule_service")
})

// express server start
// #####################################

const PORT = process.env.PORT || 8002
app.listen(PORT, () => {
  console.log(`rule_service listening on port ${PORT}!`)
})

// socket.io events
// #####################################

io.on("connection", (socket) => {
  console.log("Client connected: " + socket.id)

  socket.on("ping", () => {
    console.log("ping received")
    socket.emit("pong", "rule_service")
  })
})
