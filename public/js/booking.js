const API = "http://localhost:5000";
// For Render use:
// const API = "https://your-backend-url.onrender.com";


let selectedDate = null;


/* ================= CALENDAR ================= */

document.addEventListener("DOMContentLoaded", function () {

    const calendarEl = document.getElementById("calendar");


    const calendar = new FullCalendar.Calendar(calendarEl, {

        initialView: "dayGridMonth",

        selectable: true,


        dateClick: async function(info){

            selectedDate = info.dateStr;


            document.getElementById("selectedDate").innerText =
                "Selected: " + selectedDate;


            await loadTimeSlots(selectedDate);


            highlightSelectedDate(info.dateStr);

        },



        events: async function(fetchInfo, successCallback){


            try{


                const res = await fetch(
                    API + "/api/blocked-dates"
                );


                const blocked = await res.json();



                const events = blocked.map(date => ({


                    title:"Booked",


                    start:date,


                    color:"red"


                }));


                successCallback(events);


            }


            catch(error){


                console.log(
                    "Calendar error:",
                    error
                );


            }


        }


    });



    calendar.render();


});





/* ================= TIME SLOT LOAD ================= */


async function loadTimeSlots(date){


    try{


        const res = await fetch(
            `${API}/api/bookings-by-date/${date}`
        );


        const bookedSlots = await res.json();



        const allSlots = [


            "08:00-10:00",

            "10:00-12:00",

            "12:00-14:00",

            "14:00-16:00",

            "16:00-18:00"


        ];




        const select =
            document.getElementById("timeSlot");



        select.innerHTML =
        `
        <option value="">
        Select Time Slot
        </option>
        `;



        allSlots.forEach(slot=>{


            const option =
                document.createElement("option");



            option.value = slot;


            option.textContent = slot;



            if(bookedSlots.includes(slot)){


                option.disabled = true;


                option.style.color = "red";


                option.textContent =
                    slot + " (Booked)";


            }



            select.appendChild(option);



        });



    }


    catch(error){


        console.log(
            "Time slot error:",
            error
        );


    }


}







/* ================= PAY NOW (STRIPE 25% DEPOSIT) ================= */


async function payNow(){


    if(!selectedDate){

        return alert(
            "Please select a date"
        );

    }




    const price =
        Number(
            document.getElementById("service").value
        );




    const booking = {


        date:selectedDate,


        timeSlot:
            document.getElementById("timeSlot").value,


        name:
            document.getElementById("name").value,


        phone:
            document.getElementById("phone").value,


        email:
            document.getElementById("email").value,


        address:
            document.getElementById("address").value,


        service:
            document.getElementById("service")
            .options[
                document.getElementById("service").selectedIndex
            ].text,



        price:price


    };





    try{


        const response = await fetch(

            `${API}/api/create-deposit-checkout`,

            {

                method:"POST",


                headers:{


                    "Content-Type":
                    "application/json"


                },


                body:
                    JSON.stringify(booking)


            }

        );






        const data =
            await response.json();





        if(!response.ok){


            alert(
                data.error ||
                "Payment error"
            );


            return;


        }





        // SAVE BOOKING ID BEFORE STRIPE

        if(data.bookingId){


            localStorage.setItem(

                "bookingId",

                data.bookingId

            );


        }







        // GO TO STRIPE


        window.location.href =
            data.url;



    }



    catch(error){


        console.log(
            "PAY NOW ERROR:",
            error
        );


        alert(
            "Payment connection failed"
        );


    }



}








/* ================= PAY LATER ================= */


async function payLater(){


    if(!selectedDate){

        return alert(
            "Please select a date"
        );

    }




    const price =
        Number(
            document.getElementById("service").value
        );





    const booking = {


        date:selectedDate,


        timeSlot:
            document.getElementById("timeSlot").value,


        name:
            document.getElementById("name").value,


        phone:
            document.getElementById("phone").value,


        email:
            document.getElementById("email").value,


        address:
            document.getElementById("address").value,



        service:
            document.getElementById("service")
            .options[
                document.getElementById("service").selectedIndex
            ].text,



        price:price


    };





    try{


        const res = await fetch(

            `${API}/api/book-pay-later`,

            {

                method:"POST",


                headers:{


                    "Content-Type":
                    "application/json"


                },


                body:
                    JSON.stringify(booking)


            }

        );





        const data =
            await res.json();





        if(data.success){


            localStorage.setItem(

                "bookingId",

                data.bookingId

            );



            window.location.href =
                "/success.html";


        }


        else{


            alert(
                data.error ||
                "Booking failed"
            );


        }



    }



    catch(error){


        console.log(
            "PAY LATER ERROR:",
            error
        );


        alert(
            "Server connection failed"
        );


    }



}